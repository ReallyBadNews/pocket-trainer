import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { router, type Href } from 'expo-router';
import { useContext, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ScrollChromeContext, useChromeScroll } from './scroll-chrome';
import { C, IconButton, S, Txt } from './pokedex-ui';

/** Every tab is a stack with these options; pages draw their own header inside the Pokédex screen. */
export const pageStackOptions = {
  headerShown: false,
  // Covered pages and lists wait instead of re-rendering on every save or price update.
  freezeOnBlur: true,
  contentStyle: { backgroundColor: C.screen },
  fullScreenGestureEnabled: true,
} as const;

let lastOpened = 0;

/** Opens a page in the current tab. A second tap while the first page slides in is ignored, so a double tap doesn't stack two copies. */
export function openPage(href: Href) {
  const now = Date.now();

  if (now - lastOpened < 500) return;
  lastOpened = now;
  router.push(href);
}

/**
 * Pops the current page. Every tab stack keeps its first page underneath (even after a deep link), so there is always
 * somewhere to go; a repeated tap after the pop finds nothing to dismiss instead of jumping to another tab.
 */
export function goBack() {
  if (router.canDismiss()) router.dismiss();
}

export type PageScroll = ReturnType<typeof useChromeScroll>;

/**
 * A page pushed inside the Pokédex screen. Its title bar rides just under the device header as that collapses,
 * so Back is always in reach; an optional footer stays above the tabs. `children` receives the props for one
 * vertical scroller (ScrollView, FlatList…), already padded clear of the header and footer.
 */
export function PageFrame({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: ReactNode;
  children: (scroll: PageScroll) => ReactNode;
}) {
  const scroll = useChromeScroll();
  const chrome = useContext(ScrollChromeContext)!;
  const [headerHeight, setHeaderHeight] = useState(64);
  const [footerHeight, setFooterHeight] = useState(0);
  const { distance, progress, bottomInset } = chrome;
  const headerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: distance * (1 - progress.value) }] }));

  const contentContainerStyle = {
    paddingTop: distance + headerHeight + S.lg,
    paddingBottom: bottomInset + (footer ? footerHeight + S.lg : 40),
  };

  return (
    <View style={s.page}>
      {children({ ...scroll, contentContainerStyle })}
      <Animated.View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={[s.header, headerStyle]}
      >
        <IconButton round icon="back" label="Back" onPress={goBack} />
        <Txt accessibilityRole="header" variant="subtitle" style={s.title}>
          {title}
        </Txt>
      </Animated.View>
      {footer && (
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          style={[s.footer, { bottom: bottomInset }]}
        >
          {footer}
        </View>
      )}
    </View>
  );
}

/** The common case: one scrolling column with screen padding and section gaps. */
export function Page({
  title,
  footer,
  children,
  contentStyle,
}: {
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <PageFrame title={title} footer={footer}>
      {(scroll) => (
        <Animated.ScrollView
          {...scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, scroll.contentContainerStyle, contentStyle]}
        >
          {children}
        </Animated.ScrollView>
      )}
    </PageFrame>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.screen },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    minHeight: 60,
    backgroundColor: C.screen,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  title: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: S.xl, gap: S.xl },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: S.xl,
    paddingVertical: S.md,
    backgroundColor: C.screen,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
  },
});
