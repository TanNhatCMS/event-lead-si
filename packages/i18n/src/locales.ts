import { defaultLocale } from './default-locale';

/**
 * @name locales
 * @description Supported locales
 * @type {string[]}
 * @default [defaultLocale]
 *
 * This kit has no `[locale]` route segment, so the server always renders
 * `defaultLocale` — see `apps/web/i18n/request.ts` for why. Adding locales here
 * is supported, but read that file first: the trade-off it documents applies.
 *
 * `apps/web` chose the documented second option: the URL never carries the
 * locale, and switching happens **on the client** — every locale's messages are
 * shipped to the client and `apps/web/i18n/language-provider.tsx` feeds the
 * visitor's persisted choice (localStorage + `lang` cookie) into
 * `NextIntlClientProvider`. Pages whose copy must react to the switch render
 * their translations through client components; text baked into server
 * components and metadata stays in `defaultLocale`.
 */
export const locales: string[] = [
  defaultLocale,
  // Add other locales here as needed
  // Example: 'es', 'fr', 'de', etc.
  ...(defaultLocale === 'en' ? [] : ['en']),
];
