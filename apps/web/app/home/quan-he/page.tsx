import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { RelationshipGraph } from '../../../features/relationships/relationship-graph';

/**
 * Trang Trí tuệ quan hệ (Phase 3, FR-022): đồ thị kết nối liên hệ — công ty,
 * gợi ý người giới thiệu kèm bằng chứng. Không tự gửi lời giới thiệu.
 */
export default async function QuanHePage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title="Trí tuệ quan hệ"
        description="Đồ thị kết nối trong danh bạ và gợi ý người có thể giới thiệu bạn với một liên hệ."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-4xl">
          <RelationshipGraph />
        </div>
      </PageBody>
    </>
  );
}
