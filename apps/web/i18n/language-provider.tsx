'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/**
 * Client-side language switching without a `[locale]` route segment.
 *
 * The server always renders `routing.defaultLocale` (see `i18n/request.ts` —
 * reading the cookie or the `accept-language` header there would defeat the
 * static shell that Cache Components builds). Instead, the visitor's choice is
 * persisted on the client and fed into `NextIntlClientProvider`, which makes
 * every client component re-render in the selected locale — no URL change, no
 * server round-trip.
 *
 * Trade-offs (also documented in `request.ts`):
 *
 * - The first paint always shows the default locale; the persisted choice is
 *   restored in an effect after hydration, so SSR output and hydration match.
 * - Text baked into server components (and metadata) stays in the default
 *   locale — put translatable text in client components for it to react.
 * - Non-default translations ship with the client bundle; the root layout
 *   passes every locale's messages to this provider via the tree.
 */

const LANG_STORAGE_KEY = 'lang';

interface LanguageContextValue {
  /** The locale currently active on the client. */
  locale: string;
  /** The locale the server renders (hydration-safe initial value). */
  defaultLocale: string;
  /** Every supported locale. */
  locales: string[];
  /** Switch the active locale and persist the choice. */
  setLocale: (locale: string) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  defaultLocale,
  locales,
  children,
}: React.PropsWithChildren<{
  defaultLocale: string;
  locales: string[];
}>) {
  // Initialize with the server locale so hydration output matches SSR exactly.
  const [locale, setLocaleState] = useState(defaultLocale);

  // Restore the visitor's persisted choice after hydration.
  useEffect(() => {
    const stored = readPersistedLocale();

    if (stored && stored !== defaultLocale && locales.includes(stored)) {
      setLocaleState(stored);
    }
  }, [defaultLocale, locales]);

  // Keep `<html lang>` in sync with the active locale.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: string) => {
      if (!locales.includes(nextLocale) || nextLocale === locale) {
        return;
      }

      setLocaleState(nextLocale);
      persistLocale(nextLocale);
    },
    [locale, locales],
  );

  const value = useMemo(
    () => ({ locale, defaultLocale, locales, setLocale }),
    [locale, defaultLocale, locales, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }

  return context;
}

function readPersistedLocale(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);

    if (stored) {
      return stored;
    }

    // Cookie is the secondary store (kept in sync for future server-side reads
    // if the static-shell constraint is ever lifted).
    const match = document.cookie.match(/(?:^|;\s*)lang=([^;]*)/);

    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function persistLocale(locale: string) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, locale);
  } catch {
    // Storage may be unavailable (private mode, quota) — the cookie still
    // records the choice for the current session.
  }

  // Same cookie name the kit's LanguageSelector sets, one year retention.
  document.cookie = `${LANG_STORAGE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
