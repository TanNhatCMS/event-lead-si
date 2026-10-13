import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { AiModelEditor } from '../../../../features/ai-models/ai-model-editor';

export default async function AiModelsPage() {
  await requireUserInServerComponent();

  return (
    <>
      <PageHeader
        title={'Mô hình AI'}
        description={
          'Cấu hình model AI theo từng năng lực. Chỉ lưu thông tin không nhạy cảm — không lưu API key.'
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
