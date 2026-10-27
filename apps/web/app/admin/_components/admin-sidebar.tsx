import { Suspense } from 'react';

import { ShieldCheck } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@kit/ui/sidebar';
import { SidebarNavigation } from '@kit/ui/sidebar-navigation';
import { Skeleton } from '@kit/ui/skeleton';

import { AppLogo } from '~/components/app-logo';
import { ProfileAccountDropdownContainer } from '~/components/personal-account-dropdown-container';
import { adminNavigationConfig } from '~/config/navigation.config';
import { requireAdminInServerComponent } from '~/lib/server/require-user-in-server-component';

/**
 * Sidebar riêng của khu vực /admin — chỉ chứa navigation quản trị
 * (tách khỏi sidebar nghiệp vụ của /home), kèm nhãn nhận diện.
 */
export function AdminSidebar() {
  return (
    <Sidebar collapsible={'icon'}>
      <SidebarHeader className={'h-16 justify-center'}>
        <div className={'flex items-center justify-between space-x-2'}>
          <div className="space-y-0.5">
            <AppLogo className={'max-w-full'} />
            <p
              className={
                'flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground'
              }
            >
              <ShieldCheck className="size-3" />
              Vùng quản trị
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNavigation config={adminNavigationConfig} />
      </SidebarContent>

      <SidebarFooter>
        <Suspense fallback={<AccountDropdownFallback />}>
          <AccountDropdown />
        </Suspense>
      </SidebarFooter>
    </Sidebar>
  );
}

async function AccountDropdown() {
  const user = await requireAdminInServerComponent();

  return <ProfileAccountDropdownContainer user={user} />;
}

function AccountDropdownFallback() {
  return (
    <div className={'flex items-center gap-x-2 p-2'}>
      <Skeleton className={'size-8 shrink-0 rounded-full'} />
      <Skeleton className={'h-4 w-full'} />
    </div>
  );
}
