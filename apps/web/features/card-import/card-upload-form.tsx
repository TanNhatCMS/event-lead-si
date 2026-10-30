"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";

import { getSupabaseBrowserClient } from "@kit/supabase/browser-client";

type UploadResult = { import_id: string; path: string; token: string };

export function CardUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function submitFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    setError(false);
    const supabase = getSupabaseBrowserClient();

    let uploaded = 0;
    let failureMessage: string | null = null;
    for (const file of Array.from(files).slice(0, 10)) {
      try {
        const response = await fetch("/api/card-imports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mediaType: file.type, fileSize: file.size }),
        });
        const result = (await response.json()) as UploadResult | { message?: string };
        if (!response.ok || !("token" in result)) {
          throw new Error("message" in result ? result.message : "Không tạo được yêu cầu tải ảnh.");
        }

        const { error: uploadError } = await supabase.storage
          .from("business-cards")
          .uploadToSignedUrl(result.path, result.token, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        uploaded += 1;
      } catch (cause) {
        setError(true);
        failureMessage = cause instanceof Error ? cause.message : "Tải ảnh không thành công.";
        break;
      }
    }

    if (uploaded > 0) {
      setMessage(
        failureMessage
          ? `${uploaded} ảnh đã tải lên; phần còn lại gặp lỗi: ${failureMessage}`
          : `${uploaded} danh thiếp đã tải lên. Nhận dạng tự động sẽ khả dụng sau khi cấu hình provider được duyệt.`,
      );
    } else if (failureMessage) {
      setMessage(failureMessage);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        className="sr-only"
        onChange={(event) => void submitFiles(event.currentTarget.files)}
      />
      {/* capture="environment": trên điện thoại mở thẳng app camera sau */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => void submitFiles(event.currentTarget.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex min-h-56 w-full flex-col items-center justify-center rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 px-6 text-center transition hover:bg-indigo-50 disabled:opacity-60"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">{busy ? "…" : "↑"}</span>
        <span className="mt-4 text-sm font-semibold text-slate-800">{busy ? "Đang tải danh thiếp…" : "Chọn ảnh danh thiếp để tải lên"}</span>
        <span className="mt-1 text-xs text-slate-500">JPEG, PNG, WebP hoặc HEIC · tối đa 10 MB mỗi ảnh · tối đa 10 ảnh/lần</span>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => cameraInputRef.current?.click()}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        Chụp bằng camera
      </button>
      {message && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
    </div>
  );
}
