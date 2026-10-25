/**
 * App-specific i18n request configuration.
 * Loads translation messages from the app's messages directory.
 *
 * The namespace list and the per-locale loading logic live in
 * `load-messages.ts` so the root layout can reuse them to ship every locale's
 * messages to the client (see the trade-off below).
 */
import { getRequestConfig } from 'next-intl/server';

import { routing } from '@kit/i18n/routing';

import { loadMessages } from './load-messages';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * The locale is resolved **statically**, to `routing.defaultLocale`.
 *
 * This deliberately does not read the `lang` cookie or the `accept-language`
 * header. Both are request data, and reading either here makes every route that
 * renders a translation request-bound, which defeats the static shell that Cache
 * Components builds. It is the same mistake the i18next server instance this
 * replaced used to make. next-intl's own `requestLocale` is a lazy getter that
 * calls `headers()` on first read, so it is not touched either.
 *
 * Other kits resolve the locale from a `[locale]` route segment via
 * `next/root-params`, which is request data the router already knows statically.
 * This kit has no locale segment, so there is nothing to read.
 *
 * Out of the box this costs nothing: `locales` ships with a single entry, so the
 * cookie always resolved to the default anyway. If you add locales, either put
 * the locale in the URL so it can be a route param, or accept that non-default
 * translations arrive with the client bundle.
 *
 * This app chose the second option, without URLs changing: the server always
 * renders the default locale, and `i18n/language-provider.tsx` swaps the locale
 * **on the client** by feeding the visitor's persisted choice into
 * `NextIntlClientProvider`. Consequences to keep in mind:
 *
 * - Every page whose text must react to the switch renders its translations
 *   through client components (see the marketing home, footer and auth pages).
 * - Text baked into server components — including metadata — stays in the
 *   default locale. `<html lang>` is corrected on the client by the provider.
 * - The first paint always shows the default locale; the persisted choice is
 *   restored after hydration.
 */
export default getRequestConfig(async () => {
  const locale = routing.defaultLocale;

  // Load all namespace files and merge them
  const messages = await loadMessages(locale);

  return {
    locale,
    messages,
    timeZone: 'UTC',
    onError(error) {
      if (isDevelopment) {
        // Missing translations are expected and should only log an error
        console.warn(`[Dev Only] i18n error: ${error.message}`);
      }
    },
    getMessageFallback(info) {
      return info.key;
    },
  };
});
