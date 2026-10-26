'use client';

import { useMemo } from 'react';

import { Languages } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Trans } from '@kit/ui/trans';

import { useLanguage } from '~/i18n/language-provider';

/**
 * Client-side language switcher — the counterpart of `ModeToggle`.
 *
 * The kit's own `LanguageSelector` (packages/ui) is not used here: both of its
 * strategies assume server locale resolution (a `[locale]` path segment or a
 * `lang` cookie read by `i18n/request.ts`), while this app renders the default
 * locale statically and switches on the client — see
 * `i18n/language-provider.tsx`.
 *
 * Language names are rendered in the language itself (e.g. "Tiếng Việt",
 * "English") via `Intl.DisplayNames`, so visitors can always find their own.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, languageOptions } = useLanguageOptions();

  const items = useMemo(() => {
    return languageOptions.map((option) => (
      <DropdownMenuItem
        className={'flex cursor-pointer items-center gap-x-2'}
        key={option.value}
        onClick={() => setLocale(option.value)}
      >
        <Languages className={'h-4'} />

        <span className={option.value === locale ? 'font-medium' : undefined}>
          {option.label}
        </span>
      </DropdownMenuItem>
    ));
  }, [languageOptions, locale, setLocale]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={'ghost'} size={'icon'} className={className} />}
      >
        <Languages className={'h-[1.1rem] w-[1.1rem]'} />
        <span className={'sr-only'}>
          <Trans i18nKey={'common.language'} />
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={'end'}>{items}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Language items for use inside an existing dropdown menu — mirrors
 * `SubMenuModeToggle` from the theme toggle. Renders a sub-menu on desktop and
 * an inline labelled group on mobile.
 */
export function LanguageSubMenu() {
  const { locale, setLocale, languageOptions } = useLanguageOptions();

  const items = useMemo(() => {
    return languageOptions.map((option) => (
      <DropdownMenuItem
        className={'flex cursor-pointer items-center gap-x-2'}
        key={option.value}
        onClick={() => setLocale(option.value)}
      >
        <Languages className={'h-4'} />

        <span className={option.value === locale ? 'font-medium' : undefined}>
          {option.label}
        </span>
      </DropdownMenuItem>
    ));
  }, [languageOptions, locale, setLocale]);

  return (
    <DropdownMenuGroup>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className={
            'hidden w-full items-center justify-between gap-x-2 lg:flex'
          }
        >
          <span className={'flex items-center gap-x-2'}>
            <Languages className={'h-4'} />

            <Trans i18nKey={'common.language'} />
          </span>
        </DropdownMenuSubTrigger>

        <DropdownMenuSubContent>{items}</DropdownMenuSubContent>
      </DropdownMenuSub>

      <div className={'lg:hidden'}>
        <DropdownMenuLabel>
          <Trans i18nKey={'common.language'} />
        </DropdownMenuLabel>

        {items}
      </div>
    </DropdownMenuGroup>
  );
}

/**
 * Select-based switcher for form-like placements (e.g. the language card in
 * the account settings page) — mirrors the kit's `LanguageSelector` visuals
 * but switches on the client through `useLanguage`.
 */
export function LanguageSelect({ className }: { className?: string }) {
  const { locale, setLocale, languageOptions } = useLanguageOptions();

  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        if (value) {
          setLocale(value);
        }
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {languageOptions.map((option) => (
          <SelectItem value={option.value} key={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Wraps `useLanguage` with self-named language labels: every option is
 * resolved through its own `Intl.DisplayNames`, so the list always reads
 * "Tiếng Việt" / "English" no matter which language is active — visitors can
 * always find their own language.
 */
function useLanguageOptions() {
  const { locale, locales, setLocale } = useLanguage();

  return useMemo(() => {
    return {
      locale,
      setLocale,
      languageOptions: locales.map((value) => ({
        value,
        // Fall back to the raw code when the runtime lacks a display name.
        label: new Intl.DisplayNames([value], { type: 'language' }).of(value) ?? value,
      })),
    };
  }, [locale, locales, setLocale]);
}
