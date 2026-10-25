import { getTranslations } from 'next-intl/server';

import { NotFoundContent } from '~/components/not-found-content';

export const generateMetadata = async () => {
  const t = await getTranslations();
  const title = t('common.notFound');

  return {
    title,
  };
};

/**
 * The copy lives in a client component so it follows the visitor's language
 * choice — see `components/not-found-content.tsx`.
 */
const NotFoundPage = () => {
  return <NotFoundContent />;
};

export default NotFoundPage;
