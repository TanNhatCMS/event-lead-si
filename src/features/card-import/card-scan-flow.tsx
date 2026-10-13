"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { RecognizedCard } from "@/lib/ai/card-recognition";
import { CaptureStep } from "./capture-step";
import { CropStep } from "./crop-step";
import { RecognitionReview } from "./recognition-review";
import { cn } from "@/lib/utils";

type FlowStep = "capture" | "crop" | "processing" | "review" | "done";

const STEP_LABELS: Array<{ id: FlowStep; label: string }> = [
  { id: "capture", label: "Chụp ảnh" },
  { id: "crop", label: "Cắt ảnh" },
  { id: "processing", label: "Nhận dạng" },
  { id: "review", label: "Xác nhận" },
];

type UploadResult = { import_id: string; path: string; token: string };

function Stepper({ current }: { current: FlowStep }) {
  const order = STEP_LABELS.map((s) => s.id);
  const currentIndex = order.indexOf(current === "done" ? "review" : current);
  return (
    <ol className="flex items-center gap-1 text-xs" aria-label="Tiến trình quét danh thiếp">
      {STEP_LABELS.map((step, index) => (
        <li key={step.id} className="flex flex-1 items-center gap-1 last:flex-none">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-semibold",
              index < currentIndex
                ? "bg-emerald-100 text-emerald-700"
                : index === currentIndex
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-400",
            )}
          >
            {index + 1}
          </span>
          <span
            className={cn(
              "hidden sm:inline",
              index <= currentIndex ? "text-slate-800" : "text-slate-400",
            )}
          >
            {step.label}
          </span>
          {index < STEP_LABELS.length - 1 && <span className="mx-1 h-px flex-1 bg-slate-200" />}
        </li>
      ))}
    </ol>
  );
}

/**
 * Luồng quét danh thiếp: chụp → cắt → tải lên (signed URL, dùng chung luồng
 * card-imports hiện có) → nhận dạng → người dùng kiểm tra & xác nhận.
 *
 * KHÔNG tự lưu hồ sơ: bước nhận dạng chỉ hiển thị kết quả, hồ sơ được tạo
 * duy nhất khi người dùng bấm "Xác nhận & lưu hồ sơ" ở bước cuối.
 */
export function CardScanFlow() {
  const [step, setStep] = useState<FlowStep>("capture");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recognized, setRecognized] = useState<RecognizedCard | null>(null);
  const [provider, setProvider] = useState<string>("mock");
  const [importId, setImportId] = useState<string | null>(null);
  const [confirmedContactId, setConfirmedContactId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const reset = useCallback(() => {
    setStep("capture");
    setImageFile(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setStatus(null);
    setError(null);
    setRecognized(null);
    setProvider("mock");
    setImportId(null);
    setConfirmedContactId(null);
  }, [imageUrl]);

  const handleImageSelected = useCallback((file: File) => {
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setError(null);
    setStep("crop");
  }, []);

  const runRecognition = useCallback(async (blob: Blob) => {
    setStep("processing");
    setStatus("Đang tải ảnh lên kho riêng của tổ chức…");
    setError(null);

    const fileName = imageFile?.name ?? "danh-thiep.jpg";
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      throw new Error("Chưa cấu hình kết nối Supabase. Hãy kiểm tra biến môi trường rồi thử lại.");
    }

    // 1) Tạo yêu cầu tải ảnh (signed URL) — dùng chung API /api/card-imports.
    const uploadResponse = await fetch("/api/card-imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, mediaType: blob.type || "image/jpeg", fileSize: blob.size }),
    });
    const uploadResult = (await uploadResponse.json()) as UploadResult | { message?: string };
    if (!uploadResponse.ok || !("token" in uploadResult)) {
      throw new Error("message" in uploadResult && uploadResult.message
        ? uploadResult.message
        : "Không tạo được yêu cầu tải ảnh.");
    }

    const { error: uploadError } = await supabase.storage
      .from("business-cards")
      .uploadToSignedUrl(uploadResult.path, uploadResult.token, blob, {
        contentType: blob.type || "image/jpeg",
      });
    if (uploadError) throw uploadError;
    setImportId(uploadResult.import_id);

    // 2) Gọi nhận dạng — kết quả trả về CHƯA được lưu thành hồ sơ.
    setStatus("Đang nhận dạng danh thiếp…");
    const form = new FormData();
    form.append("image", blob, fileName);
    form.append("import_id", uploadResult.import_id);
    const recognizeResponse = await fetch("/api/card-imports/recognize", {
      method: "POST",
      body: form,
    });
    const recognizeResult = (await recognizeResponse.json()) as {
      provider?: string;
      recognized?: RecognizedCard;
      message?: string;
    };
    if (!recognizeResponse.ok || !recognizeResult.recognized) {
      throw new Error(recognizeResult.message ?? "Nhận dạng thất bại, vui lòng thử lại.");
    }
    setProvider(recognizeResult.provider ?? "mock");
    setRecognized(recognizeResult.recognized);
    setStatus(null);
    setStep("review");
  }, [imageFile]);

  const handleCropped = useCallback((blob: Blob) => {
    void runRecognition(blob).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Xử lý thất bại.");
      setStatus(null);
      setStep("crop");
    });
  }, [runRecognition]);

  const handleSkipCrop = useCallback(() => {
    if (!imageFile) return;
    void runRecognition(imageFile).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Xử lý thất bại.");
      setStatus(null);
      setStep("crop");
    });
  }, [imageFile, runRecognition]);

  const handleConfirmed = useCallback((response: { contact_id: string }) => {
    setConfirmedContactId(response.contact_id);
    setStep("done");
  }, []);

  return (
    <div className="space-y-5">
      <Stepper current={step} />

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {step === "capture" && <CaptureStep onImageSelected={handleImageSelected} />}

      {step === "crop" && imageUrl && (
        <CropStep
          imageUrl={imageUrl}
          onCropped={handleCropped}
          onSkip={handleSkipCrop}
          onBack={() => setStep("capture")}
        />
      )}

      {step === "processing" && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Spinner className="h-8 w-8 text-indigo-600" />
          <p className="text-sm text-slate-600">{status ?? "Đang xử lý…"}</p>
          <p className="max-w-sm text-xs text-slate-500">
            Ảnh được gửi tới provider nhận dạng đã cấu hình. Kết quả sẽ chờ bạn kiểm tra —
            hệ thống không tự lưu hồ sơ.
          </p>
        </div>
      )}

      {step === "review" && recognized && importId && (
        <RecognitionReview
          importId={importId}
          provider={provider}
          recognized={recognized}
          onConfirmed={handleConfirmed}
          onRescan={reset}
        />
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h3 className="text-base font-semibold text-slate-900">Đã lưu hồ sơ liên hệ</h3>
          <p className="max-w-sm text-sm text-slate-600">
            Hồ sơ đã được tạo từ các giá trị bạn xác nhận
            {confirmedContactId ? ` (mã hồ sơ: ${confirmedContactId}).` : "."}
          </p>
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Quét danh thiếp khác
          </Button>
        </div>
      )}
    </div>
  );
}
