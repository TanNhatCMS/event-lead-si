import { Page, PageMobileNavigation, PageNavigation } from '@kit/ui/page';
import { SidebarProvider } from '@kit/ui/sidebar';

import { AppLogo } from '~/components/app-logo';
import { GlobalSearch } from '~/components/global-search';
import { navigationConfig } from '~/config/navigation.config';

// home imports
import { HomeMenuNavigation } from './_components/home-menu-navigation';
import { HomeMobileNavigation } from './_components/home-mobile-navigation';
import { HomeSidebar } from './_components/home-sidebar';

/**
 * Synchronous on purpose. This layout used to await the layout-style cookie and
 * the session before rendering anything, so no route under /home could
 * prerender.
 *
 * The style now comes from navigationConfig. The cookie it read was never
 * written anywhere in the kit, so it always fell through to this value anyway.
 * The session moved down into HomeSidebar, behind a Suspense boundary.
 */
function HomeLayout({ children }: React.PropsWithChildren) {
  return (
    <>
      {navigationConfig.style === 'sidebar' ? (
        <SidebarLayout>{children}</SidebarLayout>
      ) : (
        <HeaderLayout>{children}</HeaderLayout>
      )}

      {/* ⌘K / Ctrl+K — tìm nhanh liên hệ, công ty, ghi chú (dialog portal). */}
      <GlobalSearch />
    </>
  );
}

export default HomeLayout;

function SidebarLayout({ children }: React.PropsWithChildren) {
  return (
    // defaultOpen = trạng thái MỞ RỘNG của sidebar → đảo lại so với cờ
    // `sidebarCollapsed` (đặt COLLAPSED=true mới thu gọn icon-only lúc đầu).
    <SidebarProvider defaultOpen={!navigationConfig.sidebarCollapsed}>
      <Page style={'sidebar'}>
        <PageNavigation>
          <HomeSidebar />
        </PageNavigation>

        <PageMobileNavigation className={'flex items-center justify-between'}>
          <MobileNavigation />
        </PageMobileNavigation>

        {children}
      </Page>
    </SidebarProvider>
  );
}

function HeaderLayout({ children }: React.PropsWithChildren) {
  return (
    <Page style={'header'}>
      <PageNavigation>
        <HomeMenuNavigation />
      </PageNavigation>

      <PageMobileNavigation className={'flex items-center justify-between'}>
        <MobileNavigation />
      </PageMobileNavigation>

      {children}
    </Page>
  );
}

function MobileNavigation() {
  return (
    <>
      <AppLogo />

      <HomeMobileNavigation />
    </>
  );
}
