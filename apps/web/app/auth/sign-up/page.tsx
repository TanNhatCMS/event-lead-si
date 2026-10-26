import { getTranslations } from 'next-intl/server';

import { SignUpContent } from './sign-up-content';

export const generateMetadata = async () => {
  const t = await getTranslations();

  return {
    title: t('auth.signUp'),
  };
};

/**
 * The copy lives in a client component so it follows the visitor's language
 * choice — see `sign-up-content.tsx` and `i18n/language-provider.tsx`.
 */
function SignUpPage() {
  return <SignUpContent />;
}

export default SignUpPage;
