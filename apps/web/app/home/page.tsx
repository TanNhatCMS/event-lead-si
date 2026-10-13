import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { DashboardOverview } from '../../features/dashboard/dashboard-overview';

/**
 * Trang chủ EventLead: tổng quan số liệu thật
 * (thay demo dashboard của kit).
 */
export default async function HomePage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description="Số liệu danh bạ và hoạt động quét danh thiếp của bạn."
      />

      <PageBody>
        <DashboardOverview />
      </PageBody>
    </>
  );
}
