import { ScanScreen } from '@/screens/scan-screen';
import { usePokedexNav } from '@/lib/pokedex-nav';

export default function ScanRoute() {
  const { scan, openCard, onScanAdded } = usePokedexNav();
  return <ScanScreen sessionId={scan.session} initialQuery={scan.query} captureRequest={scan.captureRequest} onCard={openCard} onAdded={onScanAdded} />;
}
