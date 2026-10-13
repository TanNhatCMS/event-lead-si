import { Bot, Building2, Cpu, History, Home, Network, PackageSearch, ScanLine, User, Users } from 'lucide-react';
import { z } from 'zod';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

import pathsConfig from '~/config/paths.config';

const iconClasses = 'w-4';

const routes = [
  {
    label: 'common.routes.application',
    children: [
      {
        label: 'common.routes.home',
        path: pathsConfig.app.home,
        Icon: <Home className={iconClasses} />,
        // exact match: do not stay highlighted on nested routes like /home/settings
        highlightMatch: `^${pathsConfig.app.home}$`,
      },
      {
        label: 'common.routes.scanCard',
        path: pathsConfig.app.scanCard,
        Icon: <ScanLine className={iconClasses} />,
      },
      {
        label: 'common.routes.contacts',
        path: pathsConfig.app.contacts,
        Icon: <Users className={iconClasses} />,
      },
      {
        label: 'common.routes.companies',
        path: pathsConfig.app.companies,
        Icon: <Building2 className={iconClasses} />,
      },
      {
        label: 'common.routes.sourcing',
        path: pathsConfig.app.sourcing,
        Icon: <PackageSearch className={iconClasses} />,
      },
      {
        label: 'common.routes.relationships',
        path: pathsConfig.app.relationships,
        Icon: <Network className={iconClasses} />,
      },
      {
        label: 'common.routes.aiModels',
        path: pathsConfig.app.aiModels,
        Icon: <Cpu className={iconClasses} />,
      },
      {
        label: 'common.routes.auditLog',
        path: pathsConfig.app.auditLog,
        Icon: <History className={iconClasses} />,
      },
      {
        label: 'common.routes.assistant',
        path: pathsConfig.app.assistant,
        Icon: <Bot className={iconClasses} />,
      },
    ],
  },
  {
    label: 'common.routes.settings',
    children: [
      {
        label: 'common.routes.profile',
        path: pathsConfig.app.profileSettings,
        Icon: <User className={iconClasses} />,
      },
    ],
  },
] satisfies z.infer<typeof NavigationConfigSchema>['routes'];

export const navigationConfig = NavigationConfigSchema.parse({
  routes,
  style: process.env.NEXT_PUBLIC_NAVIGATION_STYLE,
  sidebarCollapsed: process.env.NEXT_PUBLIC_HOME_SIDEBAR_COLLAPSED,
});
