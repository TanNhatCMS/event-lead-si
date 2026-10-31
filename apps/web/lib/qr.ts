import QRCode from 'qrcode';

/**
 * Tạo ảnh QR (data-URL PNG) cho một đoạn văn bản — chỉ dùng cho link
 * chia sẻ CÔNG KHAI (trang /chia-se/<token>, /chia-se-lien-he/<token>).
 * KHÔNG dùng cho API key, token nội bộ hay dữ liệu nhạy cảm khác.
 */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 256, margin: 2 });
}
