import { PageBody, PageHeader } from '@kit/ui/page';

import { UsersManager } from '../../../features/user-management/users-manager';
import { requireAdminInServerComponent } from '~/lib/server/require-user-in-server-component';

// Auth là per-request (connection()) — cho phép route chặn dữ liệu thay vì
// đòi shell tĩnh khi prerender (Cache Components).
export const instant = false;

/**
 * Trang quản lý người dùng (khu vực quản trị): danh sách tài khoản,
 * chặn/bỏ chặn, xóa — qua GoTrue admin API bằng service-role.
 */
export default async function UsersPage() {
  await requireAdminInServerComponent();

  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Quản lý tài khoản đăng nhập hệ thống: xem trạng thái, chặn/bỏ chặn, xóa người dùng."
      />

      <PageBody>
        <div className="mx-auto w-full max-w-5xl">
          <UsersManager />
        </div>
      </PageBody>
    </>
  );
}
