import { ScanScreen } from '@/screens/scan-screen';
import { useCollection } from '@/lib/collection-context';
import { usePokedexNav } from '@/lib/pokedex-nav';

export default function ScanRoute() {
  const { trainer } = useCollection();
  const { scan, openCard, onScanAdded } = usePokedexNav();

  // Keyed by trainer and visit so switching trainers or coming back to Scan resets the language choice to
  // Auto-detect, as it did before tabs were routes. Within a visit it stays put between cards.
  return (
    <ScanScreen
      key={`${trainer.id}:${scan.visit}`}
      sessionId={scan.session}
      initialQuery={scan.query}
      captureRequest={scan.captureRequest}
      onCard={openCard}
      onAdded={onScanAdded}
    />
  );
}
