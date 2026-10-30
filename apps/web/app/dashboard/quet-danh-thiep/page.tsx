import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { CardScanFlow } from '../../../features/card-import/card-scan-flow';

/**
 * Trang quét danh thiếp: chụp/cắt ảnh -> nhận dạng OCR -> kiểm tra & xác nhận.
 * Yêu cầu đăng nhập (requireUserInServerComponent tự redirect khi chưa login).
 */
export default async function QuetDanhThiepPage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title="Quét danh thiếp"
        description="Chụp ảnh danh thiếp, cắt khung, xem kết quả máy đọc rồi xác nhận mới lưu hồ sơ."
      />

      <PageBody>
        <div className="mx-auto max-w-3xl">
          <CardScanFlow />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Mẹo: mở trang này trên điện thoại rồi chọn “Thêm vào Màn hình chính” (menu trình
            duyệt) để cài EventLead như một ứng dụng — chụp danh thiếp nhanh hơn ở sự kiện.
          </p>
        </div>
      </PageBody>
    </>
  );
}
