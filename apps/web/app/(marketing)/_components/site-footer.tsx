'use client';

import { useEffect, useState } from 'react';

import { Footer } from '@kit/ui/marketing';
import { Trans } from '@kit/ui/trans';

import { AppLogo } from '~/components/app-logo';
import appConfig from '~/config/app.config';

/**
 * A client component so the footer copy follows the visitor's language
 * choice — see `i18n/language-provider.tsx`. As client output it no longer
 * needs the `'use cache'` trick the server version required to keep the
 * marketing pages prerenderable.
 *
 * The copyright year is read in an effect: `new Date()` during render is an
 * unstable value that Cache Components rejects while prerendering, and the
 * year changes once a year, so rendering it right after hydration is fine.
 */
export function SiteFooter() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <Footer
      logo={<AppLogo className="w-[85px] md:w-[95px]" />}
      description={<Trans i18nKey="marketing.footerDescription" />}
      copyright={
        <Trans
          i18nKey="marketing.copyright"
          values={{
            product: appConfig.name,
            year: year ?? '',
          }}
        />
      }
      sections={[
        {
          heading: <Trans i18nKey="marketing.getStarted" />,
          links: [
            {
              href: '/auth/sign-in',
              label: <Trans i18nKey="auth.signIn" />,
            },
            {
              href: '/auth/sign-up',
              label: <Trans i18nKey="auth.signUp" />,
            },
          ],
        },
        {
          heading: <Trans i18nKey="marketing.legal" />,
          links: [
            {
              href: '/terms-of-service',
              label: <Trans i18nKey="marketing.termsOfService" />,
            },
            {
              href: '/privacy-policy',
              label: <Trans i18nKey="marketing.privacyPolicy" />,
            },
            {
              href: '/cookie-policy',
              label: <Trans i18nKey="marketing.cookiePolicy" />,
            },
          ],
        },
      ]}
    />
  );
}
