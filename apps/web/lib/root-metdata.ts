import { Metadata } from 'next';

import { getTranslations } from 'next-intl/server';

import appConfig from '~/config/app.config';

/**
 * @name generateRootMetadata
 * @description Generates the root metadata for the application
 *
 * The title and description come from the `marketing` namespace instead of the
 * `NEXT_PUBLIC_SITE_TITLE` env vars, which shipped Makerkit boilerplate in
 * English regardless of the app's locale.
 *
 * The locale resolves statically (see `i18n/request.ts`): `getTranslations`
 * reads the locale returned by the request config, which never touches
 * `headers()`, so metadata stays prerenderable — it renders in the default
 * locale. Awaiting translations is fine: like the messages, they are static
 * JSON imports, not request data.
 */
export const generateRootMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations('marketing');

  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    metadataBase: new URL(appConfig.url),
    applicationName: appConfig.name,
    openGraph: {
      url: appConfig.url,
      siteName: appConfig.name,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    icons: {
      icon: '/images/favicon/favicon.ico',
      apple: '/images/favicon/apple-touch-icon.png',
    },
  };
};
