import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type HeaderTitleVariant = 'h1' | 'h2';

interface ModalHeaderTitleState {
  variant: HeaderTitleVariant;
  allowWrap: boolean;
}

export const useModalHeaderTitle = (text: string) => {
  const [state, setState] = useState<ModalHeaderTitleState>({
    variant: 'h1',
    allowWrap: false,
  });
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setState({ variant: 'h1', allowWrap: false });
  }, [text]);

  // Measure overflow and step down typography (h1 → h2 → wrap). Do NOT reset to h1 when
  // the title "fits" here — that fights the overflow branch and can oscillate (React #185).
  // `useEffect` above resets to h1 whenever `text` changes.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;

    const availableWidth = el.clientWidth;
    const requiredWidth = el.scrollWidth;

    setState(prev => {
      if (requiredWidth <= availableWidth) {
        return prev;
      }
      if (prev.variant === 'h1') {
        return { variant: 'h2', allowWrap: false };
      }
      if (!prev.allowWrap) {
        return { ...prev, allowWrap: true };
      }
      return prev;
    });
  }, [text, state.variant, state.allowWrap]);

  return {
    titleRef,
    variant: state.variant,
    allowWrap: state.allowWrap,
  };
};
