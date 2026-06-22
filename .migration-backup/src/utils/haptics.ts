import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const hapticLight  = () => Haptics.impact({ style: ImpactStyle.Light  }).catch(() => {});
export const hapticMedium = () => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
