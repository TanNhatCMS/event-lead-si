import { Page, PageMobileNavigation, PageNavigation } from '@kit/ui/page';
import { SidebarProvider } from '@kit/ui/sidebar';

import { AppLogo } from '~/components/app-logo';
import { adminNavigationConfig } from '~/config/navigation.config';

import { AdminMobileNavigation } from './_components/admin-mobile-navigation';
import { AdminSidebar } from './_components/admin-sidebar';

/**
 * Shell riêng cho khu vực /admin: sidebar chỉ chứa navigation quản trị,
 * không dùng chung navigation với /home.
 */
function AdminLayout({ children }: React.PropsWithChildren) {
  return (
    // defaultOpen = trạng thái MỞ RỘNG — đảo so với cờ `sidebarCollapsed`.
    <SidebarProvider defaultOpen={!adminNavigationConfig.sidebarCollapsed}>
      <Page style={'sidebar'}>
        <PageNavigation>
          <AdminSidebar />
        </PageNavigation>

        <PageMobileNavigation className={'flex items-center justify-between'}>
          <MobileNavigation />
        </PageMobileNavigation>

        {children}
      </Page>
    </SidebarProvider>
  );
}

export default AdminLayout;

function MobileNavigation() {
  return (
    <>
      <AppLogo />

      <AdminMobileNavigation />
    </>
  );
}
