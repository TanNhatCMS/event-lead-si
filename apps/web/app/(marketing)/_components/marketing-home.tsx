'use client';

import Image from 'next/image';
import Link from 'next/link';

import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Bot,
  Camera,
  Check,
  Download,
  Network,
  ScanLine,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';

import { Button } from '@kit/ui/button';

/**
 * Trang chủ marketing — thiết kế riêng cho EventLead (không dùng khung
 * marketing chung của kit). Client component để đổi ngôn ngữ phía client
 * mà không cần round-trip server (xem `i18n/request.ts`).
 */

const FEATURES: Array<{ key: (typeof FEATURE_KEYS)[number]; Icon: LucideIcon }> = [
  { key: 'Scan', Icon: ScanLine },
  { key: 'Contacts', Icon: Users },
  { key: 'Enrichment', Icon: Sparkles },
  { key: 'Assistant', Icon: Bot },
  { key: 'Relationships', Icon: Network },
  { key: 'Export', Icon: Download },
];

const FEATURE_KEYS = [
  'Scan',
  'Contacts',
  'Enrichment',
  'Assistant',
  'Relationships',
  'Export',
] as const;

const STEPS: Array<{ Icon: LucideIcon }> = [
  { Icon: Camera },
  { Icon: Sparkles },
  { Icon: UserCheck },
];
const STEP_NUMBERS = ['01', '02', '03'];

const STRIP_ITEMS = [1, 2, 3, 4] as const;

export function MarketingHome() {
  const t = useTranslations('marketing');

  return (
    <div className="flex flex-col">
      {/* ----------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ----------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-48 -z-10 flex justify-center"
        >
          <div className="h-[480px] w-[900px] max-w-full rounded-full bg-primary/15 blur-3xl" />
        </div>

        <div className="container mx-auto flex flex-col items-center px-4 pb-16 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Sparkles className="size-3.5 text-primary" />
            {t('homeBadgeText')}
          </span>

          <h1 className="mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {t('homeTitleLine1')}{' '}
            <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
              {t('homeTitleAccent')}
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            {t('homeSubtitle')}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              size={'lg'}
              className="h-11 px-6 text-sm"
              render={<Link href={'/auth/sign-up'} />}
            >
              {t('homeCtaPrimary')}
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size={'lg'}
              variant={'outline'}
              className="h-11 px-6 text-sm"
              render={<Link href={'/auth/sign-in'} />}
            >
              {t('homeCtaSecondary')}
            </Button>
          </div>

          {/* Ảnh product trong khung browser + glow */}
          <div className="relative mt-16 w-full max-w-5xl">
            <div
              aria-hidden
              className="absolute -inset-x-10 -top-10 bottom-10 rounded-[3rem] bg-gradient-to-tr from-primary/25 via-primary/5 to-transparent blur-2xl"
            />
            <div className="relative overflow-hidden rounded-2xl border bg-background shadow-2xl">
              <div
                aria-hidden
                className="flex items-center gap-1.5 border-b bg-muted/60 px-4 py-2.5"
              >
                <span className="size-2.5 rounded-full bg-red-400/80" />
                <span className="size-2.5 rounded-full bg-yellow-400/80" />
                <span className="size-2.5 rounded-full bg-green-400/80" />
                <span className="ml-3 rounded-md bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                  eventlead.app
                </span>
              </div>
              <Image
                priority
                className="h-auto w-full"
                width={2880}
                height={1800}
                src="/images/dashboard-real.png"
                alt={t('homeHeroImageAlt')}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Trust strip                                                       */}
      {/* ----------------------------------------------------------------- */}
      <section className="border-y bg-muted/40">
        <div className="container mx-auto grid grid-cols-1 gap-4 px-4 py-8 sm:grid-cols-2 md:grid-cols-4">
          {STRIP_ITEMS.map((index) => (
            <div key={index} className="flex items-center justify-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Check className="size-3 text-primary" />
              </span>
              <span className="text-sm font-medium">{t(`homeStrip${index}`)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* How it works — 3 bước                                             */}
      {/* ----------------------------------------------------------------- */}
      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('homeStepsHeading')}
          </h2>
          <p className="mt-4 text-muted-foreground">{t('homeStepsSubtitle')}</p>
        </div>

        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ Icon }, index) => (
            <li key={index} className="relative">
              <div className="h-full rounded-2xl border bg-card p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="size-5 text-primary" />
                  </span>
                  <span className="text-2xl font-bold tracking-tight text-muted-foreground/30">
                    {STEP_NUMBERS[index]}
                  </span>
                </div>
                <h3 className="mt-5 font-semibold">
                  {t(`homeStep${index + 1}Title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`homeStep${index + 1}Description`)}
                </p>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  aria-hidden
                  className="absolute -right-4 top-1/2 hidden h-px w-8 bg-border md:block"
                />
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Features — bento grid                                             */}
      {/* ----------------------------------------------------------------- */}
      <section className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t('homeFeaturesHeading')}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t('homeFeaturesSubtitle')}
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, Icon }, index) => (
              <div
                key={key}
                className={
                  'group rounded-2xl border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-md' +
                  (index === 0 ? ' sm:col-span-2' : '')
                }
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <Icon className="size-5 text-primary" />
                </span>
                <h3 className="mt-4 font-semibold">
                  {t(`homeFeature${key}Label`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`homeFeature${key}Description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* CTA band                                                          */}
      {/* ----------------------------------------------------------------- */}
      <section className="container mx-auto px-4 pb-24 pt-20">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(255,255,255,0.18),transparent)]"
          />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
            {t('homeCtaTitle')}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-primary-foreground/80">
            {t('homeCtaSubtitle')}
          </p>
          <div className="relative mt-8">
            <Button
              size={'lg'}
              variant={'secondary'}
              className="h-11 px-8 text-sm font-semibold"
              render={<Link href={'/auth/sign-up'} />}
            >
              {t('homeCtaButton')}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
