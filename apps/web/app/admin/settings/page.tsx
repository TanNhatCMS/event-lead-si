import { PageBody, PageHeader } from '@kit/ui/page';

import { AiModelEditor } from '../../../features/ai-models/ai-model-editor';
import { requireAdminInServerComponent } from '~/lib/server/require-user-in-server-component';

// Auth là per-request (connection()) — cho phép route chặn dữ liệu thay vì
// đòi shell tĩnh khi prerender (Cache Components).
export const instant = false;

export default async function AiModelsSettingsPage() {
  await requireAdminInServerComponent();

  return (
    <>
      <PageHeader
        title={'Mô hình AI'}
        description={
          'Chọn nhà cung cấp và model AI cho từng năng lực. Chỉ lưu thông tin không nhạy cảm — không lưu API key.'
        }
      />

      <PageBody>
        <div className={'flex w-full flex-1 flex-col gap-y-5 lg:max-w-3xl'}>
          <AiModelEditor />
        </div>
      </PageBody>
    </>
  );
}
