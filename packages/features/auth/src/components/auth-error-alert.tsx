import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';

/**
 * @name AuthErrorAlert
 * @param error This error comes from Supabase as the code returned on errors
 * This error is mapped from the translation auth:errors.{error}
 * To update the error messages, please update the translation file
 * https://github.com/supabase/gotrue-js/blob/master/src/lib/errors.ts
 * @constructor
 */
export function AuthErrorAlert({
  error,
}: {
  error: Error | null | undefined | string;
}) {
  const t = useTranslations('auth');

  if (!error) {
    return null;
  }

  const errorCode = error instanceof Error ? error.message : error;
  // Mã lỗi không có trong bản dịch (vd lỗi mạng) → dùng message mặc định
  // thay vì render nguyên văn fallback của <Trans>.
  const message = t.has(`errors.${errorCode}`)
    ? t(`errors.${errorCode}`)
    : t('errors.default');

  return (
    <Alert variant={'destructive'}>
      <TriangleAlert className={'w-4'} />

      <AlertTitle>{t('errorAlertHeading')}</AlertTitle>

      <AlertDescription data-test={'auth-error-message'}>
        {message}
      </AlertDescription>
    </Alert>
  );
}
