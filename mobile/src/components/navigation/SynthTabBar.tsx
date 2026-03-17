import React from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Compass, Plus, MessageCircle, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthTokens } from '../../tokens/SynthTokens';

const { width } = Dimensions.get('window');

export const SynthTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
    const insets = useSafeAreaInsets();
    const TAB_BAR_HEIGHT = 83 + insets.bottom;

    const onTabPress = (route: any, isFocused: boolean) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
        });

        if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
        }
    };

    const onPlusPress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // In web it goes to /post. For now we emit a custom event or navigate to a post route if exists
        // navigation.navigate('post'); 
        console.log('Plus button pressed');
    };

    return (
        <View style={[styles.container, { height: TAB_BAR_HEIGHT, paddingBottom: insets.bottom }]}>
            <View style={styles.content}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;

                    // Skip the center index if we want to place the plus button there manually
                    // or just handle it if the route is 'post'
                    if (route.name === 'post') {
                        return (
                            <View key={route.key} style={styles.tabItem}>
                                <TouchableOpacity
                                    onPress={() => onTabPress(route, isFocused)}
                                    style={styles.plusButtonContainer}
                                    activeOpacity={0.8}
                                >
                                    <View style={styles.plusButton}>
                                        <Plus color="white" size={32} strokeWidth={2.5} />
                                    </View>
                                </TouchableOpacity>
                            </View>
                        );
                    }

                    const getIcon = (name: string, color: string) => {
                        switch (name) {
                            case 'index': return <Home color={color} size={24} />;
                            case 'discover': return <Compass color={color} size={24} />;
                            case 'chat': return <MessageCircle color={color} size={24} />;
                            case 'profile': return <User color={color} size={24} />;
                            default: return null;
                        }
                    };

                    const color = isFocused ? SynthTokens.colors.brandPink500 : SynthTokens.colors.neutral400;

                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={() => onTabPress(route, isFocused)}
                            style={styles.tabItem}
                            activeOpacity={0.7}
                        >
                            {getIcon(route.name, color)}
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
        width: '100%',
        backgroundColor: SynthTokens.colors.neutral0,
        borderTopWidth: 1,
        borderTopColor: SynthTokens.colors.neutral200,
        borderTopLeftRadius: SynthTokens.radius.corner,
        borderTopRightRadius: SynthTokens.radius.corner,
    },
    content: {
        flexDirection: 'row',
        height: 60,
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    plusButtonContainer: {
        top: -20, // Float above baseline
    },
    plusButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: SynthTokens.colors.brandPink500,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: SynthTokens.shadow.color,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 5,
    },
});
