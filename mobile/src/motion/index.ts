/**
 * Synth motion kit. Rules:
 *  - Animate transform/opacity only, never left/top/width/margin (#6). All existing
 *    animations in the app already follow this.
 *  - Respect Reduce Motion (each helper here does).
 *  - Pressables: scale from 0.97, not 0.9.
 */
export { PressableScale, PRESS_SCALE, PRESS_SPRING, firePressHaptic } from './PressableScale';
export type { PressableScaleProps, PressHaptic } from './PressableScale';
export { useShake } from './useShake';
export { SmoothHeight, DirectionalSlide, useSlideDirection, LAYOUT_MS } from './layout';
export { rubberBand, useDragToDismiss } from './drag';
