import { redirect } from 'next/navigation';

import pathsConfig from '~/config/paths.config';

/**
 * Route cũ `/home/nhat-ky` đã dời sang `/admin/nhat-ky` —
 * redirect để giữ tương thích với link/bookmark cũ.
 */
export default function AuditLogRedirectPage() {
  redirect(pathsConfig.app.auditLog);
}
