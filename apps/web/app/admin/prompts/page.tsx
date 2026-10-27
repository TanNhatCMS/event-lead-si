import { PageBody, PageHeader } from '@kit/ui/page';

import { PromptManager } from '../../../features/prompts/prompt-manager';
import { requireAdminInServerComponent } from '~/lib/server/require-user-in-server-component';

// Auth là per-request (connection()) — cho phép route chặn dữ liệu thay vì
// đòi shell tĩnh khi prerender (Cache Components).
export const instant = false;

/**
 * Trang quản lý prompts AI (khu vực quản trị): xem/sửa 7 system prompts,
 * khôi phục về bản mặc định.
 */
export default async function PromptsPage() {
  await requireAdminInServerComponent();

  return (
    <>
      <PageHeader
        title="Prompts AI"
        description="Tùy chỉnh system prompt cho từng tính năng AI. Thay đổi có hiệu lực ngay cho các lần gọi tiếp theo."
      />

      <PageBody>
        <PromptManager />
      </PageBody>
    </>
  );
}
