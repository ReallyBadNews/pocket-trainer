import { DeviceMotion } from 'expo-sensors';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  makeMutable,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// One motion listener feeds every shimmering card; it runs only while at least one is on screen.
const tilt = makeMutable(0);

let listeners = 0;

let subscription: { remove: () => void } | undefined;

let motion: Promise<boolean> | undefined;

function watchTilt() {
  listeners++;
  motion ??= DeviceMotion.isAvailableAsync().catch(() => false);
  void motion.then((available) => {
    if (!available || subscription || listeners === 0) return;
    DeviceMotion.setUpdateInterval(50);
    // Left–right tilt (gamma, radians) plus a little of the forward tilt moves the shine across the card.
    subscription = DeviceMotion.addListener(({ rotation }) => {
      if (rotation) tilt.set(Math.max(-1, Math.min(1, rotation.gamma * 1.6 + (rotation.beta - 0.6) * 0.5)));
    });
  });

  return () => {
    listeners--;

    if (listeners === 0) {
      subscription?.remove();
      subscription = undefined;
    }
  };
}

// Soft stripes read as a foil gradient: faint cyan, a bright white core, then gold and pink.
const FOIL: [string, number][] = [
  ['#7DF9FF', 0.06],
  ['#7DF9FF', 0.14],
  ['#B8FFF5', 0.24],
  ['#FFFFFF', 0.38],
  ['#FFFFFF', 0.55],
  ['#FFF6C2', 0.42],
  ['#FFE66D', 0.3],
  ['#FF9BE0', 0.2],
  ['#FF7AD9', 0.1],
  ['#FF7AD9', 0.04],
];

/** A rainbow foil sheen that slides across the card as the device tilts, or drifts on its own without motion. */
export function HoloShine({
  children,
  style,
  radius = 8,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [moving, setMoving] = useState(false);
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const stop = watchTilt();
    void motion?.then((available) => setMoving(available));

    return stop;
  }, [reduced]);
  useEffect(() => {
    if (reduced || moving) return;
    drift.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
          withTiming(-1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
  }, [reduced, moving, drift]);

  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: (moving ? tilt.get() : drift.get()) * width * 1.05 }, { rotate: '22deg' }],
  }));

  return (
    <View
      style={[style, { overflow: 'hidden', borderRadius: radius }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {children}
      {width > 0 && (
        <Animated.View pointerEvents="none" style={[s.band, { width: width * 0.8, left: width * 0.1 }, band]}>
          {FOIL.map(([color, opacity], i) => (
            <View key={i} style={{ flex: 1, backgroundColor: color, opacity }} />
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const CONFETTI = ['#E95661', '#EAC55A', '#57C7E8', '#7AC74C', '#A98FF3', '#F08A3C'];

function Piece({ progress, seed }: { progress: SharedValue<number>; seed: number }) {
  const p = useMemo(() => {
    const random = (n: number) => {
      const x = Math.sin(seed * 9301 + n * 49297) * 233280;

      return x - Math.floor(x);
    };

    const angle = Math.PI * (0.1 + 0.8 * random(1));

    return {
      dx: Math.cos(angle) * (90 + 120 * random(2)),
      dy: -Math.sin(angle) * (170 + 150 * random(3)),
      spin: (random(4) - 0.5) * 1440,
      color: CONFETTI[seed % CONFETTI.length],
      wide: random(5) > 0.5,
    };
  }, [seed]);

  const style = useAnimatedStyle(() => {
    const t = progress.get();

    return {
      opacity: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
      transform: [{ translateX: p.dx * t }, { translateY: p.dy * t + 420 * t * t }, { rotate: `${p.spin * t}deg` }],
    };
  });

  return (
    <Animated.View
      style={[s.piece, { backgroundColor: p.color, width: p.wide ? 12 : 7, height: p.wide ? 7 : 12 }, style]}
    />
  );
}

/** A one-shot burst of paper confetti from the center of its parent. */
export function Confetti({ count = 30 }: { count?: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) }));
  }, [progress]);

  return (
    <View pointerEvents="none" style={s.burst}>
      {Array.from({ length: count }, (_, i) => (
        <Piece key={i} progress={progress} seed={i + 1} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  band: { position: 'absolute', top: '-30%', height: '160%', flexDirection: 'row' },
  burst: { position: 'absolute', left: '50%', top: '45%', width: 0, height: 0, zIndex: 3 },
  piece: { position: 'absolute', borderRadius: 2 },
});
