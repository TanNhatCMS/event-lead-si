'use client';

import Image from 'next/image';
import Link from 'next/link';

import { useTranslations } from 'next-intl';

import { ArrowRightIcon, LayoutDashboard } from 'lucide-react';

import {
  CtaButton,
  EcosystemShowcase,
  FeatureCard,
  FeatureGrid,
  FeatureShowcase,
  FeatureShowcaseIconContainer,
  Hero,
  Pill,
  PillActionButton,
} from '@kit/ui/marketing';
import { Trans } from '@kit/ui/trans';

/**
 * The marketing home page content. A client component on purpose: the server
 * renders the default locale statically (see `i18n/request.ts`), and rendering
 * the copy through `NextIntlClientProvider` lets the visitor switch language on
 * the client without a server round-trip.
 */
export function MarketingHome() {
  const t = useTranslations('marketing');

  return (
    <div className={'mt-4 flex flex-col space-y-24 py-14'}>
      <div className={'container mx-auto'}>
        <Hero
          pill={
            <Pill label={t('homePillLabel')}>
              <span>{t('homePillText')}</span>
              {/**
               * The icon is a child of PillActionButton rather than of the
               * `render` element: `useRender` passes its own `children` through
               * `mergeProps`, so children supplied on the render element are
               * resolved differently on the server and on the client, which
               * hydrates as a mismatch.
               */}
              <PillActionButton render={<Link href={'/auth/sign-up'} />}>
                <ArrowRightIcon className={'h-4 w-4'} />
              </PillActionButton>
            </Pill>
          }
          title={
            <span className="text-secondary-foreground">
              <span>{t('homeHeroTitle')}</span>
            </span>
          }
          subtitle={<span>{t('homeHeroSubtitle')}</span>}
          cta={<MainCallToActionButton />}
          image={
            <Image
              priority
              className={
                'dark:border-primary/10 w-full rounded-lg border border-gray-200'
              }
              width={3558}
              height={2222}
              src={`/images/dashboard.webp`}
              alt={t('homeHeroImageAlt')}
            />
          }
        />
      </div>

      <div className={'container mx-auto'}>
        <div className={'py-4 xl:py-8'}>
          <FeatureShowcase
            heading={
              <>
                <b className="font-medium tracking-tight dark:text-white">
                  {t('homeShowcaseHeading')}
                </b>
                {t('homeShowcaseHeadingSuffix')}{' '}
                <span className="text-secondary-foreground/70 block font-normal tracking-tight">
                  {t('homeShowcaseSubtitle')}
                </span>
              </>
            }
            icon={
              <FeatureShowcaseIconContainer>
                <LayoutDashboard className="h-4 w-4" />
                <span>{t('homeShowcaseIconLabel')}</span>
              </FeatureShowcaseIconContainer>
            }
          >
            <FeatureGrid>
              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={t('homeFeatureScanLabel')}
                description={t('homeFeatureScanDescription')}
              ></FeatureCard>

              <FeatureCard
                className={'relative col-span-1 w-full overflow-hidden'}
                label={t('homeFeatureContactsLabel')}
                description={t('homeFeatureContactsDescription')}
              ></FeatureCard>

              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={t('homeFeatureEnrichmentLabel')}
                description={t('homeFeatureEnrichmentDescription')}
              />

              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={t('homeFeatureRelationshipsLabel')}
                description={t('homeFeatureRelationshipsDescription')}
              />

              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={t('homeFeatureAssistantLabel')}
                description={t('homeFeatureAssistantDescription')}
              />

              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={t('homeFeatureExportLabel')}
                description={t('homeFeatureExportDescription')}
              />
            </FeatureGrid>
          </FeatureShowcase>
        </div>
      </div>

      <div className={'container mx-auto'}>
        <EcosystemShowcase
          heading={t('homeEcosystemHeading')}
          description={t('homeEcosystemDescription')}
        >
          <Image
            className="rounded-md"
            src={'/images/sign-in.webp'}
            alt={t('homeHeroImageAlt')}
            width={1000}
            height={1000}
          />
        </EcosystemShowcase>
      </div>
    </div>
  );
}

function MainCallToActionButton() {
  return (
    <div className={'flex space-x-2.5'}>
      <CtaButton className="h-10 text-sm">
        <Link href={'/auth/sign-up'}>
          <span className={'flex items-center space-x-0.5'}>
            <span>
              <Trans i18nKey={'common.getStarted'} />
            </span>

            <ArrowRightIcon
              className={
                'animate-in fade-in slide-in-from-left-8 h-4' +
                ' zoom-in fill-mode-both delay-1000 duration-1000'
              }
            />
          </span>
        </Link>
      </CtaButton>

      <CtaButton variant={'link'} className="h-10 text-sm">
        <Link href={'/contact'}>
          <Trans i18nKey={'common.contactUs'} />
        </Link>
      </CtaButton>
    </div>
  );
}
