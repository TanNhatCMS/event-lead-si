import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { PromptManager } from '../../../../features/prompts/prompt-manager';

/**
 * Trang quản lý prompts AI: xem/sửa 7 system prompts,
 * khôi phục về bản mặc định.
 */
export default async function PromptsPage() {
  await requireUserInServerComponent();

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
