import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { AuditTabs } from '../../../features/audit-log/audit-tabs';

/**
 * Trang Nhật ký: tab Hành động (audit log) + tab Trace AI (OpenTelemetry).
 */
export default async function AuditLogPage() {
  await requireUserInServerComponent();

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
