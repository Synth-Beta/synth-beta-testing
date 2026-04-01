import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Compass, Plus, MessageCircle, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthTokens } from '../../tokens/SynthTokens';
import { supabase } from '../../integrations/supabase/client';
import { useUnreadMessageCount } from '../../hooks/useUnreadMessageCount';

/** Matches web [BottomNav.css](src/components/BottomNav/BottomNav.css): pink-050 bar, 2px top border, pill CTA 70×40, brand pink icons. */
const CTA_WIDTH = 70;
const CTA_HEIGHT = 40;
const CTA_RADIUS = 20;
const ICON_SIZE = 24;
const INACTIVE_ICON_OPACITY = 0.5;

/** Tab routes that exist in the navigator but should not show a bar item (e.g. stack-like screens under Tabs). */
const TAB_BAR_HIDDEN_ROUTE_NAMES = new Set(['search']);

/** Icon row + top padding (matches `minHeight: 44` + `paddingTop: 12`). */
export const TAB_BAR_CORE_HEIGHT = 56;

/**
 * Extra bottom padding for scrollable tab content so it clears this bar + home indicator.
 * Cards use `elevation` on Android; this bar must sit above them in z-order too.
 */
export function tabBarBottomContentPadding(safeAreaBottom: number, extra = 8): number {
  return TAB_BAR_CORE_HEIGHT + safeAreaBottom + extra;
}

export const SynthTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const [uid, setUid] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUid(user?.id));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const unreadMessages = useUnreadMessageCount(uid);
  const TAB_BAR_HEIGHT = 56 + insets.bottom;

  const onTabPress = (route: (typeof state.routes)[0], isFocused: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const visibleRoutes = state.routes.filter(r => !TAB_BAR_HIDDEN_ROUTE_NAMES.has(r.name));
  const activeRouteName = state.routes[state.index]?.name;

  return (
    <View style={[styles.container, { minHeight: TAB_BAR_HEIGHT, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {visibleRoutes.map(route => {
          const isFocused = activeRouteName === route.name;

          if (route.name === 'post') {
            return (
              <View key={route.key} style={styles.tabItem}>
                <TouchableOpacity
                  onPress={() => onTabPress(route, isFocused)}
                  style={styles.ctaPill}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Post"
                >
                  <Plus color={SynthTokens.colors.neutral50} size={22} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            );
          }

          const showUnreadDot = route.name === 'chat' && unreadMessages > 0 && !isFocused;

          const iconColor = SynthTokens.colors.brandPink500;
          const iconOpacity = isFocused ? 1 : INACTIVE_ICON_OPACITY;

          const icon = (() => {
            switch (route.name) {
              case 'index':
                return <Home color={iconColor} size={ICON_SIZE} />;
              case 'discover':
                return <Compass color={iconColor} size={ICON_SIZE} />;
              case 'chat':
                return <MessageCircle color={iconColor} size={ICON_SIZE} />;
              case 'profile':
                return <User color={iconColor} size={ICON_SIZE} />;
              default:
                return null;
            }
          })();

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => onTabPress(route, isFocused)}
              style={styles.tabItem}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
            >
              <View style={styles.iconWrap}>
                <View style={{ opacity: iconOpacity }}>{icon}</View>
                {showUnreadDot ? <View style={styles.unreadDot} accessibilityLabel="Unread messages" /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    elevation: Platform.OS === 'android' ? 24 : 0,
    backgroundColor: SynthTokens.colors.brandPink050,
    borderTopWidth: 2,
    borderTopColor: SynthTokens.colors.neutral200,
    borderTopLeftRadius: SynthTokens.radius.corner,
    borderTopRightRadius: SynthTokens.radius.corner,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: SynthTokens.spacing.screenMarginX,
    paddingTop: 12,
    minHeight: 44,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  iconWrap: {
    position: 'relative',
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: SynthTokens.colors.brandPink050,
  },
  ctaPill: {
    width: CTA_WIDTH,
    height: CTA_HEIGHT,
    borderRadius: CTA_RADIUS,
    backgroundColor: SynthTokens.colors.brandPink500,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
