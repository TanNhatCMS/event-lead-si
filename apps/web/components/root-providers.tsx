'use client';

import dynamic from 'next/dynamic';

import type { AbstractIntlMessages } from 'next-intl';
import { ThemeProvider } from 'next-themes';

import { CaptchaProvider } from '@kit/auth/captcha/client';
import { I18nClientProvider } from '@kit/i18n/provider';
import { routing } from '@kit/i18n/routing';
import { If } from '@kit/ui/if';
import { VersionUpdater } from '@kit/ui/version-updater';

import { AuthProvider } from '~/components/auth-provider';
import appConfig from '~/config/app.config';
import authConfig from '~/config/auth.config';
import featuresFlagConfig from '~/config/feature-flags.config';
import {
  LanguageProvider,
  useLanguage,
} from '~/i18n/language-provider';

import { ReactQueryProvider } from './react-query-provider';

const captchaSiteKey = authConfig.captchaTokenSiteKey;

const CaptchaTokenSetter = dynamic(async () => {
  if (!captchaSiteKey) {
    return Promise.resolve(() => null);
  }

  const { CaptchaTokenSetter } = await import('@kit/auth/captcha/client');

  return {
    default: CaptchaTokenSetter,
  };
});

/**
 * The messages of every supported locale, keyed by locale code. The root layout
 * loads them statically so the visitor can switch language on the client
 * without a server round-trip — see `i18n/language-provider.tsx`.
 */
export type MessagesByLocale = Record<string, AbstractIntlMessages>;

export function RootProviders({
  defaultLocale,
  messagesByLocale,
  theme = appConfig.theme,
  children,
}: React.PropsWithChildren<{
  // The locale the server renders (hydration-safe initial value)
  defaultLocale: string;
  // The i18n messages of every supported locale
  messagesByLocale: MessagesByLocale;
  theme?: string;
}>) {
  return (
    <ReactQueryProvider>
      <LanguageProvider
        defaultLocale={defaultLocale}
        locales={routing.locales}
      >
        <ActiveLocaleProvider messagesByLocale={messagesByLocale}>
          <CaptchaProvider>
            <CaptchaTokenSetter siteKey={captchaSiteKey} />

            <AuthProvider>
              <ThemeProvider
                attribute="class"
                enableSystem
                disableTransitionOnChange
                defaultTheme={theme}
                enableColorScheme={false}
              >
                {children}
              </ThemeProvider>
            </AuthProvider>
          </CaptchaProvider>

          <If condition={featuresFlagConfig.enableVersionUpdater}>
            <VersionUpdater />
          </If>
        </ActiveLocaleProvider>
      </LanguageProvider>
    </ReactQueryProvider>
  );
}

/**
 * Bridges the visitor's active locale into `NextIntlClientProvider`. Switching
 * the locale re-renders this subtree with the matching messages, so every
 * client component picks up the new language immediately.
 */
function ActiveLocaleProvider({
  messagesByLocale,
  children,
}: React.PropsWithChildren<{
  messagesByLocale: MessagesByLocale;
}>) {
  const { locale, defaultLocale } = useLanguage();

  const messages =
    messagesByLocale[locale] ?? messagesByLocale[defaultLocale] ?? {};

  return (
    <I18nClientProvider locale={locale} messages={messages}>
      {children}
    </I18nClientProvider>
  );
}
