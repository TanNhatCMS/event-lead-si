'use client';

import Link from 'next/link';

import { Button } from '@kit/ui/button';
import { Heading } from '@kit/ui/heading';
import { Trans } from '@kit/ui/trans';

import { SignUpMethodsContainer } from '@kit/auth/sign-up';

import authConfig from '~/config/auth.config';
import pathsConfig from '~/config/paths.config';

const paths = {
  callback: pathsConfig.auth.callback,
  appHome: pathsConfig.app.home,
};

/**
 * Client component so the copy follows the visitor's language choice — see
 * `i18n/language-provider.tsx`. The page shell stays a server component for
 * the metadata.
 */
export function SignUpContent() {
  return (
    <>
      <div className={'flex flex-col items-center'}>
        <Heading level={2} className={'tracking-tighter'}>
          <Trans i18nKey={'auth.signUpHeading'} />
        </Heading>
      </div>

      <SignUpMethodsContainer
        providers={authConfig.providers}
        displayTermsCheckbox={authConfig.displayTermsCheckbox}
        paths={paths}
      />

      <div className={'flex justify-center'}>
        <Button
          nativeButton={false}
          variant={'link'}
          size={'sm'}
          render={
            <Link href={pathsConfig.auth.signIn}>
              <Trans i18nKey={'auth.alreadyHaveAnAccount'} />
            </Link>
          }
        />
      </div>
    </>
  );
}
