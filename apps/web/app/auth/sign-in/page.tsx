import { getTranslations } from 'next-intl/server';

import { SignInContent } from './sign-in-content';

export const generateMetadata = async () => {
  const t = await getTranslations();

  return {
    title: t('auth.signIn'),
  };
};

/**
 * The copy lives in a client component so it follows the visitor's language
 * choice — see `sign-in-content.tsx` and `i18n/language-provider.tsx`.
 */
function SignInPage() {
  return <SignInContent />;
}

export default SignInPage;
