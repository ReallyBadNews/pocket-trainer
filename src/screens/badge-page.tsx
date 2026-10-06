import { Page } from '@/components/page';
import { Txt } from '@/components/pokedex-ui';
import { BADGES } from '@/lib/badges';

// Web export pre-renders one page per badge.
export function generateStaticParams() {
  return BADGES.map(badge => ({ id: badge.id }));
}

// Placeholder: being built.
export function BadgePage() {
  return <Page title="Badge"><Txt muted>Coming soon.</Txt></Page>;
}
