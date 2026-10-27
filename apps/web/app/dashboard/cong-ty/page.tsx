import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { CompaniesList } from '../../../features/companies/companies-list';

/**
 * Trang Công ty: danh sách công ty đã lưu, số liên hệ và link chia sẻ công khai.
 */
export default async function CongTyPage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title="Công ty"
        description="Các công ty được tạo khi xác nhận danh thiếp. Sao chép link để chia sẻ hồ sơ công khai."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-4xl">
          <CompaniesList />
        </div>
      </PageBody>
    </>
  );
}
