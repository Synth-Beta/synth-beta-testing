/**
 * Haptic feedback helpers. No-ops on this web bundle — haptics require a
 * native bridge (the legacy Capacitor iOS app that provided one is gone;
 * the current native app ships via Expo, see mobile/, with its own haptics).
 * Kept so existing call sites don't need to be torn out individually.
 */
export const hapticLight = () => {};
export const hapticMedium = () => {};
