'use client';

import Link from 'next/link';

import { Button } from '@kit/ui/button';
import { Heading } from '@kit/ui/heading';
import { Trans } from '@kit/ui/trans';

import { SignInMethodsContainer } from '@kit/auth/sign-in';

import authConfig from '~/config/auth.config';
import pathsConfig from '~/config/paths.config';

const paths = {
  callback: pathsConfig.auth.callback,
  home: pathsConfig.app.home,
};

/**
 * Client component so the copy follows the visitor's language choice — see
 * `i18n/language-provider.tsx`. The page shell stays a server component for
 * the metadata.
 */
export function SignInContent() {
  return (
    <>
      <div className={'flex flex-col items-center'}>
        <Heading level={2} className={'tracking-tighter'}>
          <Trans
            i18nKey={'auth.signInHeading'}
            values={{ productName: process.env.NEXT_PUBLIC_PRODUCT_NAME }}
          />
        </Heading>
      </div>

      <SignInMethodsContainer paths={paths} providers={authConfig.providers} />

      <div className={'flex justify-center'}>
        <Button
          nativeButton={false}
          variant={'link'}
          size={'sm'}
          render={
            <Link href={pathsConfig.auth.signUp}>
              <Trans i18nKey={'auth.doNotHaveAccountYet'} />
            </Link>
          }
        />
      </div>
    </>
  );
}
