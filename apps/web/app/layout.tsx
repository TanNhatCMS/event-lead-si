import { routing } from '@kit/i18n/routing';
import { Toaster } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';

import { RootProviders } from '~/components/root-providers';
import appConfig from '~/config/app.config';
import { loadMessagesForAllLocales } from '~/i18n/load-messages';
import { heading, sans } from '~/lib/fonts';
import { generateRootMetadata } from '~/lib/root-metdata';

import '../styles/globals.css';

/**
 * The root layout awaits nothing request-bound on purpose. Reading the theme
 * cookie, the locale cookie or the session here makes every route in the app
 * dynamic, because nothing below it can prerender until that resolves.
 *
 * Loading the messages is safe to await: the locales come from `routing`, so
 * what is left is a set of static JSON imports — async, but not request data.
 * Every locale's messages are passed down so the visitor can switch language
 * on the client — see `i18n/language-provider.tsx` and `i18n/request.ts`.
 *
 * The theme is resolved on the client instead: next-themes runs a script before
 * paint to apply the stored theme. `suppressHydrationWarning` is required
 * because it writes the theme class onto `<html>` before React hydrates.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = routing.defaultLocale;
  const messagesByLocale = await loadMessagesForAllLocales();

  return (
    <html lang={locale} className={getClassName()} suppressHydrationWarning>
      <body>
        <RootProviders
          theme={appConfig.theme}
          defaultLocale={locale}
          messagesByLocale={messagesByLocale}
        >
          {children}

          {/* inside the providers so it can follow next-themes reactively */}
          <Toaster richColors={true} position="top-center" />
        </RootProviders>
      </body>
    </html>
  );
}

function getClassName() {
  const font = [sans.variable, heading.variable].reduce<string[]>(
    (acc, curr) => {
      if (acc.includes(curr)) return acc;

      return [...acc, curr];
    },
    [],
  );

  return cn('bg-background min-h-screen antialiased', ...font);
}

export const generateMetadata = generateRootMetadata;
