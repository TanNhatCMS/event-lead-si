import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { ContactsList } from '../../../features/contacts/contacts-list';

/**
 * Trang Danh bạ: danh sách liên hệ đã lưu, tìm kiếm và lọc lưu trữ.
 * Yêu cầu đăng nhập (requireUserInServerComponent tự redirect khi chưa login).
 */
export default async function DanhBaPage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title="Danh bạ"
        description="Tất cả liên hệ đã lưu từ danh thiếp. Bấm vào một liên hệ để xem chi tiết và chỉnh sửa."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-4xl">
          <ContactsList />
        </div>
      </PageBody>
    </>
  );
}
