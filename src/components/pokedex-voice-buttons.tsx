import { Button, ButtonRow } from '@/components/pokedex-ui';
import type { usePokedexVoice } from '@/lib/use-pokedex-voice';

/** Reading the entry and playing the cry look and sound the same wherever a Pokémon's entry shows. */
export function PokedexVoiceButtons({
  id,
  name,
  voice,
}: {
  id: number;
  name: string;
  voice: ReturnType<typeof usePokedexVoice>;
}) {
  const reading = voice.speaking === id;

  return (
    <ButtonRow style={{ alignSelf: 'stretch' }}>
      <Button
        title={reading ? 'Stop reading' : 'Read it to me'}
        icon={reading ? 'stop' : 'speaker'}
        selected={reading}
        accessibilityHint={reading ? undefined : `Reads ${name}'s Pokédex entry aloud`}
        secondary
        size="medium"
        onPress={() => (reading ? voice.stop() : void voice.speak(id))}
      />
      <Button
        title="Hear its cry"
        icon="note"
        accessibilityHint={`Plays ${name}'s cry`}
        secondary
        size="medium"
        onPress={() => void voice.cry(id)}
      />
    </ButtonRow>
  );
}
