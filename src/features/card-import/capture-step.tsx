"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, TriangleAlert, Video, VideoOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

interface CaptureStepProps {
  onImageSelected: (file: File) => void;
}

/**
 * Bước 1 — Lấy ảnh danh thiếp:
 * - Chụp trực tiếp bằng camera của điện thoại (mở app camera native),
 * - Chọn ảnh có sẵn từ máy,
 * - Hoặc xem trước camera trực tiếp trong trình duyệt (getUserMedia) rồi chụp.
 */
export function CaptureStep({ onImageSelected }: CaptureStepProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [liveCamera, setLiveCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const acceptFile = useCallback(
    (file: File | undefined | null) => {
      setError(null);
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Vui lòng chọn một tệp ảnh (JPG, PNG, WebP, HEIC).");
        return;
      }
      if (file.size > CARD_IMAGE_MAX_BYTES) {
        setError("Ảnh quá lớn (tối đa 10 MB). Vui lòng chọn ảnh nhỏ hơn.");
        return;
      }
      stopStream();
      onImageSelected(file);
    },
    [onImageSelected, stopStream],
  );

  const startLiveCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trình duyệt này không hỗ trợ camera trực tiếp.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setLiveCamera(true);
      // Gán srcObject sau khi video đã render.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch (err) {
      setCameraError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Bạn đã từ chối quyền camera. Hãy cấp quyền hoặc dùng nút “Chụp bằng camera” / “Chọn ảnh” bên dưới."
          : "Không mở được camera trực tiếp. Hãy dùng nút “Chụp bằng camera” hoặc “Chọn ảnh từ máy”.",
      );
    }
  };

  const captureFromLive = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) acceptFile(new File([blob], "chup-danh-thiep.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Camera className="h-5 w-5 text-indigo-600" /> Bước 1 — Chụp ảnh danh thiếp
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Đặt danh thiếp trên mặt phẳng, đủ sáng, chụp thẳng để kết quả tốt nhất.
        </p>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {liveCamera ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button onClick={captureFromLive} className="flex-1" size="lg">
              <Camera className="h-4 w-4" /> Chụp ảnh
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                stopStream();
                setLiveCamera(false);
              }}
            >
              <VideoOff className="h-4 w-4" /> Tắt
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" size="lg" onClick={startLiveCamera}>
          <Video className="h-4 w-4" /> Xem trước camera trực tiếp
        </Button>
      )}
      {cameraError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {cameraError}
        </p>
      )}

      <div className={cn("grid grid-cols-1 gap-3", "sm:grid-cols-2")}>
        <Button size="lg" className="h-14" onClick={() => cameraInputRef.current?.click()}>
          <Camera className="h-5 w-5" /> Chụp bằng camera
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-14"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-5 w-5" /> Chọn ảnh từ máy
        </Button>
      </div>

      {/* capture="environment": trên điện thoại mở thẳng app camera sau */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />

      <p className="text-center text-xs text-slate-500">
        Ảnh mờ, xoay hoặc che một phần vẫn xử lý được — bạn sẽ kiểm tra lại từng trường ở bước sau.
      </p>
    </div>
  );
}
