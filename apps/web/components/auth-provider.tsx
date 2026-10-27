'use client';

import { useAuthChangeListener } from '@kit/supabase/hooks/use-auth-change-listener';

import pathsConfig from '~/config/paths.config';

export function AuthProvider(props: React.PropsWithChildren) {
  useAuthChangeListener({
    appHomePath: pathsConfig.app.home,
    // Các vùng yêu cầu đăng nhập — đăng xuất giữa chừng sẽ đưa người dùng
    // về trang sign-in. /auth/* do proxy.ts xử lý riêng.
    privatePathPrefixes: [
      pathsConfig.app.home,
      pathsConfig.app.admin,
      pathsConfig.auth.passwordUpdate,
    ],
  });

  return props.children;
}
