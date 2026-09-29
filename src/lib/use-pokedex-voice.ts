import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { cryUrl, pokedexLine } from './pokedex-voice';

let voice: Promise<string | undefined> | undefined;
// Prefer a clear, higher-quality US English voice when the device has one installed.
const pickVoice = () => voice ??= Speech.getAvailableVoicesAsync()
  .then(voices => voices.filter(v => v.language === 'en-US').sort((a, b) => Number(b.quality === Speech.VoiceQuality.Enhanced) - Number(a.quality === Speech.VoiceQuality.Enhanced))[0]?.identifier)
  .catch(() => undefined);
let audioReady: Promise<void> | undefined;
// Cries are sound effects, so they follow the ring/silent switch and mix with other audio.
const prepareAudio = () => audioReady ??= setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});

/** Reads Pokédex entries aloud and plays cries; everything stops when the screen closes. */
export function usePokedexVoice() {
  const [speaking, setSpeaking] = useState<number | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; Speech.stop(); player.current?.remove(); player.current = null; };
  }, []);
  async function cry(id: number) {
    const url = cryUrl(id);
    if (!url) return;
    await prepareAudio();
    if (!alive.current) return;
    player.current?.remove();
    try { player.current = createAudioPlayer(url); player.current.play(); } catch { player.current = null; }
  }
  async function speak(id: number) {
    const text = pokedexLine(id);
    if (!text) return;
    await Speech.stop();
    const identifier = await pickVoice();
    if (!alive.current) return;
    setSpeaking(id);
    const done = () => { if (alive.current) setSpeaking(current => current === id ? null : current); };
    Speech.speak(text, { language: 'en-US', voice: identifier, pitch: 1.05, rate: .92, onDone: done, onStopped: done, onError: done });
  }
  function stop() { void Speech.stop(); setSpeaking(null); }
  return { speaking, speak, stop, cry };
}
