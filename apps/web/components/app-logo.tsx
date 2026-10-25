import Link from 'next/link';

import { cn } from '@kit/ui/utils';

/**
 * Text wordmark replacing the Makerkit SVG logo the starter kit shipped with —
 * the SVG rendered the literal string "Makerkit" on every page.
 */
function LogoImage({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'text-primary dark:text-primary-foreground select-none text-xl font-bold tracking-tight',
        className,
      )}
    >
      Event<span className={'text-muted-foreground'}>Lead</span>
    </span>
  );
}

export function AppLogo({
  href,
  label,
  className,
}: {
  href?: string | null;
  className?: string;
  label?: string;
}) {
  if (href === null) {
    return <LogoImage className={className} />;
  }

  return (
    <Link aria-label={label ?? 'EventLead'} href={href ?? '/'}>
      <LogoImage className={className} />
    </Link>
  );
}
