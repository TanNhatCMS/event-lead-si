import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { AssistantTabs } from '../../../features/assistant/assistant-tabs';

/**
 * Trang Trợ lý: chat RAG tra cứu tài liệu + danh bạ (spec 002, FR-005/007/013)
 * và tab quản lý tài liệu (T010).
 */
export default async function AssistantPage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title="Trợ lý"
        description="Hỏi đáp từ tài liệu và danh bạ của bạn — mọi câu trả lời đều kèm nguồn trích dẫn."
      />

      <PageBody>
        <AssistantTabs />
      </PageBody>
    </>
  );
}
