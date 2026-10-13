"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { ChevronLeft, Crop } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getCroppedImage } from "./lib/crop-image";

/** Tỉ lệ danh thiếp chuẩn 85.6 × 54 mm. */
const CARD_ASPECT = 85.6 / 54;

interface CropStepProps {
  imageUrl: string;
  onCropped: (blob: Blob) => void;
  onSkip: () => void;
  onBack: () => void;
}

/** Bước 2 — Cắt đơn giản: kéo/thu phóng để lấy đúng khung danh thiếp. */
export function CropStep({ imageUrl, onCropped, onSkip, onBack }: CropStepProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedPixels(pixels);
  }, []);

  const handleCrop = async () => {
    if (!croppedPixels) return;
    setWorking(true);
    setError(null);
    try {
      const blob = await getCroppedImage(imageUrl, croppedPixels);
      onCropped(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cắt được ảnh.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Crop className="h-5 w-5 text-indigo-600" /> Bước 2 — Cắt ảnh
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Kéo để di chuyển, dùng thanh trượt để thu/phóng sao cho khung bao vừa danh thiếp.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="relative h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-black sm:h-80">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={CARD_ASPECT}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <input
        type="range"
        min={1}
        max={3}
        step={0.05}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="w-full accent-indigo-600"
        aria-label="Thu phóng"
      />
      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={handleCrop} disabled={working || !croppedPixels}>
          {working && <Spinner className="h-4 w-4" />}
          Cắt &amp; tiếp tục
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack} disabled={working}>
            <ChevronLeft className="h-4 w-4" /> Chụp lại
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onSkip} disabled={working}>
            Giữ nguyên ảnh
          </Button>
        </div>
      </div>
    </div>
  );
}
