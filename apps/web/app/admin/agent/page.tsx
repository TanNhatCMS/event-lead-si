import { PageBody, PageHeader } from '@kit/ui/page';

import { AgentToolingManager } from '../../../features/agent-tooling/agent-tooling-manager';
import { TinyFishCard } from '../../../features/agent-tooling/tinyfish-card';
import { requireAdminInServerComponent } from '~/lib/server/require-user-in-server-component';

// Auth là per-request (connection()) — cho phép route chặn dữ liệu thay vì
// đòi shell tĩnh khi prerender (Cache Components).
export const instant = false;

/**
 * Trang Năng lực Agent (khu vực quản trị): quản lý MCP Tools, Skills,
 * Hooks, Plugins cho các agent + tích hợp TinyFish (key trong DB, webhook).
 */
export default async function AgentToolingPage() {
  await requireAdminInServerComponent();

  return (
    <>
      <PageHeader
        title="Năng lực Agent"
        description="Cấu hình công cụ cho agent: MCP server ngoài, skill markdown, hook bảo mật/giám sát và bật/tắt từng tool built-in. Có hiệu lực ở lần chạy agent tiếp theo."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-4xl space-y-5">
          <TinyFishCard />
          <AgentToolingManager />
        </div>
      </PageBody>
    </>
  );
}
