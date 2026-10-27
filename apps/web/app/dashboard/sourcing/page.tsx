import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { SourcingList } from '../../../features/sourcing/sourcing-list';

/**
 * Trang Sourcing (Phase 3, FR-019): yêu cầu tìm nhà cung cấp,
 * ứng viên kèm bằng chứng, danh sách ngắn, chuẩn bị đàm phán.
 */
export default async function SourcingPage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title="Sourcing"
        description="Tìm kiếm và so sánh nhà cung cấp: mô tả nhu cầu, thu thập ứng viên kèm bằng chứng, chốt danh sách ngắn."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-4xl">
          <SourcingList />
        </div>
      </PageBody>
    </>
  );
}
