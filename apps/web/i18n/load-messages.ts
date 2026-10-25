/**
 * Loads translation messages for a locale.
 *
 * Namespaces live in separate files under `messages/${locale}/`, so adding a
 * namespace means adding a file under both locale directories and an entry in
 * `namespaces` below.
 *
 * These are static JSON imports — async, but not request data — so calling this
 * from the root layout (for every locale) and from the next-intl request config
 * keeps every route prerenderable.
 */
import { routing } from '@kit/i18n/routing';
import type { AbstractIntlMessages } from 'next-intl';

const namespaces = [
  'common',
  'auth',
  'account',
  'teams',
  'billing',
  'marketing',
] as const;

export async function loadMessages(locale: string): Promise<AbstractIntlMessages> {
  const loadedMessages: Record<string, unknown> = {};

  // Load each namespace file
  await Promise.all(
    namespaces.map(async (namespace) => {
      try {
        const namespaceMessages = await import(
          `./messages/${locale}/${namespace}.json`
        );

        loadedMessages[namespace] = namespaceMessages.default;
      } catch (error) {
        console.warn(
          `Failed to load namespace "${namespace}" for locale "${locale}":`,
          error,
        );

        // Set empty object as fallback
        loadedMessages[namespace] = {};
      }
    }),
  );

  return loadedMessages as AbstractIntlMessages;
}

/**
 * Loads the messages of every supported locale, keyed by locale code.
 *
 * The root layout passes the result to the client so the visitor can switch
 * language without a server round-trip — see `i18n/language-provider.tsx`.
 * Non-default translations therefore ship with the client bundle: that is the
 * documented trade-off in `request.ts` for keeping the static shell.
 */
export async function loadMessagesForAllLocales(): Promise<
  Record<string, AbstractIntlMessages>
> {
  const entries = await Promise.all(
    routing.locales.map(async (locale) => {
      const messages = await loadMessages(locale);

      return [locale, messages] as const;
    }),
  );

  return Object.fromEntries(entries);
}
