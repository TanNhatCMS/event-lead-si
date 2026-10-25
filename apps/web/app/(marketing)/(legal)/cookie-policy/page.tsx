import { getTranslations } from 'next-intl/server';

import { SitePageHeader } from '~/(marketing)/_components/site-page-header';

export async function generateMetadata() {
  const t = await getTranslations();

  return {
    title: t('marketing.cookiePolicy'),
  };
}

async function CookiePolicyPage() {
  const t = await getTranslations();

  return (
    <div>
      <SitePageHeader
        title={t(`marketing.cookiePolicy`)}
        subtitle={t(`marketing.cookiePolicyDescription`)}
      />

      <div className={'container mx-auto py-8'}>
        <div>Nội dung chính sách cookie sẽ được cập nhật.</div>
      </div>
    </div>
  );
}

export default CookiePolicyPage;
