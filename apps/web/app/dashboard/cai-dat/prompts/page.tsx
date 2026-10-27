import { redirect } from 'next/navigation';

import pathsConfig from '~/config/paths.config';

/**
 * Route cũ `/home/cai-dat/prompts` đã dời sang `/admin/prompts` —
 * redirect để giữ tương thích với link/bookmark cũ.
 */
export default function PromptsRedirectPage() {
  redirect(pathsConfig.app.aiPrompts);
}
