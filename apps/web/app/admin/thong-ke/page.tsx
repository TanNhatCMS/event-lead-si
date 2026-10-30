import { PageBody, PageHeader } from '@kit/ui/page';

import { PricesManager } from '../../../features/usage-stats/prices-manager';
import { UsageDashboard } from '../../../features/usage-stats/usage-dashboard';
import { requireAdminInServerComponent } from '~/lib/server/require-user-in-server-component';

// Auth là per-request (connection()) — cho phép route chặn dữ liệu thay vì
// đòi shell tĩnh khi prerender (Cache Components).
export const instant = false;

/**
 * Trang Thống kê Token (khu vực quản trị): tổng hợp token đã dùng
 * (đầu vào/đầu ra/cache), chi phí quy đổi USD theo model và bảng giá
 * dùng để quy đổi.
 */
export default async function UsageStatsPage() {
  await requireAdminInServerComponent();

  return (
    <>
      <PageHeader
        title="Thống kê Token"
        description="Token đã dùng (đầu vào/đầu ra/cache), chi phí theo model và bảng giá quy đổi."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-5xl space-y-5">
          <UsageDashboard />
          <PricesManager />
        </div>
      </PageBody>
    </>
  );
}
