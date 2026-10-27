import { redirect } from 'next/navigation';

import pathsConfig from '~/config/paths.config';

/**
 * Route cũ `/home/cai-dat/ai-models` đã dời sang `/admin/settings` —
 * redirect để giữ tương thích với link/bookmark cũ.
 */
export default function AiModelsRedirectPage() {
  redirect(pathsConfig.app.aiModels);
}
