import { ScanScreen } from '@/screens/scan-screen';
import { useCollection } from '@/lib/collection-context';
import { usePokedexNav } from '@/lib/pokedex-nav';

export default function ScanRoute() {
  const { trainer } = useCollection();
  const { scan, openCard, onScanAdded } = usePokedexNav();

  // Keyed by trainer so a switch also resets the language choice, as it did before tabs were routes.
  return (
    <ScanScreen
      key={trainer.id}
      sessionId={scan.session}
      initialQuery={scan.query}
      captureRequest={scan.captureRequest}
      onCard={openCard}
      onAdded={onScanAdded}
    />
  );
}
