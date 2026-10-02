import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import frame from '../../assets/crafted/discovery-device.json';
import { speciesImage } from '@/lib/catalog';

/** One short screen wake; the result is immediate with Reduce Motion or a tap. */
export function DiscoveryDevice({ id, onReveal }: { id: number; onReveal: () => void }) {
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(reduced);
  const complete = useRef(false);
  const light = useSharedValue(reduced ? 1 : 0);
  const reveal = useCallback(() => {
    if (complete.current) return;
    complete.current = true;
    light.value = reduced ? 1 : withTiming(1, { duration: 240 });
    setRevealed(true);
    onReveal();
  }, [light, onReveal, reduced]);
  useEffect(() => {
    if (reduced) { reveal(); return; }
    const timer = setTimeout(reveal, 650);
    return () => clearTimeout(timer);
  }, [reduced, reveal]);
  const screen = useAnimatedStyle(() => ({ opacity: light.value }));
  const illustration = <>
    <Image source={require('../../assets/crafted/discovery-device.png')} style={StyleSheet.absoluteFill} contentFit="contain" />
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.screen, screen]}>
      <Image source={speciesImage(id)} contentFit="contain" style={s.pokemon} />
    </Animated.View>
  </>;
  return revealed ? <View style={s.device}>{illustration}</View> : <Pressable accessibilityRole="button" accessibilityLabel="Reveal the new Pokémon" accessibilityHint="Skips the short Pokédex screen wake." onPress={reveal} style={s.device}>{illustration}</Pressable>;
}

const s = StyleSheet.create({
  device: { width: '100%', maxWidth: 330, aspectRatio: frame.width / frame.height, alignSelf: 'center' },
  screen: { position: 'absolute', left: `${frame.screen.x * 100}%`, top: `${frame.screen.y * 100}%`, width: `${frame.screen.width * 100}%`, height: `${frame.screen.height * 100}%`, borderRadius: 4, overflow: 'hidden', backgroundColor: '#E6EFDA', alignItems: 'center', justifyContent: 'center' },
  pokemon: { width: '92%', height: '92%' },
});
