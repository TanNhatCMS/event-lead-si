import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { AuditLogList } from '../../../features/audit-log/audit-log-list';

/**
 * Trang Nhật ký (Audit log, phase 1): xem/lọc các hành động đã ghi nhận.
 * Phase 2 sẽ bổ sung tab xem trace OpenTelemetry cho các bước LLM.
 */
export default async function AuditLogPage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title="Nhật ký"
        description="Các hành động đã thực hiện: tạo/sửa/xóa danh bạ, công ty, ghi chú, xác nhận danh thiếp."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-4xl">
          <AuditLogList />
        </div>
      </PageBody>
    </>
  );
}
