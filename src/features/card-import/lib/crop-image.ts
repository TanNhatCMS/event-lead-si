/**
 * Cắt ảnh theo vùng pixel đã chọn (từ react-easy-crop) bằng canvas.
 * Trả về Blob JPEG — sẵn sàng tải lên hoặc gửi cho provider nhận dạng.
 */
export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh để cắt."));
    img.src = src;
  });
}

export async function getCroppedImage(
  imageSrc: string,
  crop: CropAreaPixels,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<Blob> {
  const { maxWidth = 1600, quality = 0.9 } = opts;
  const image = await loadImage(imageSrc);

  const scale = Math.min(1, maxWidth / crop.width);
  const outW = Math.round(crop.width * scale);
  const outH = Math.round(crop.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas.");

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outW, outH);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Không tạo được ảnh sau khi cắt.");
  return blob;
}
