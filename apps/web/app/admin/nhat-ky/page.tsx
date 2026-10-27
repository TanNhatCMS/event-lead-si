import { PageBody, PageHeader } from '@kit/ui/page';

import { requireAdminInServerComponent } from '~/lib/server/require-user-in-server-component';

import { AuditTabs } from '../../../features/audit-log/audit-tabs';

// Auth là per-request (connection()) — cho phép route chặn dữ liệu thay vì
// đòi shell tĩnh khi prerender (Cache Components).
export const instant = false;

/**
 * Trang Nhật ký (khu vực quản trị): tab Hành động (audit log) + tab
 * Trace AI (OpenTelemetry).
 */
export default async function AuditLogPage() {
  await requireAdminInServerComponent();

  return (
    <>
      <PageHeader
        title="Nhật ký"
        description="Các hành động đã thực hiện và trace chi tiết từng bước AI."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-4xl">
          <AuditTabs />
        </div>
      </PageBody>
    </>
  );
}
