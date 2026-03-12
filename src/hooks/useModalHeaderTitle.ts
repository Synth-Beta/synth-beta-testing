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

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;

    const availableWidth = el.clientWidth;
    const requiredWidth = el.scrollWidth;

    if (requiredWidth <= availableWidth) {
      if (state.variant !== 'h1' || state.allowWrap) {
        setState({ variant: 'h1', allowWrap: false });
      }
      return;
    }

    if (state.variant === 'h1') {
      setState(prev => ({ ...prev, variant: 'h2', allowWrap: false }));
      return;
    }

    if (!state.allowWrap) {
      setState(prev => ({ ...prev, allowWrap: true }));
    }
  }, [text, state]);

  return {
    titleRef,
    variant: state.variant,
    allowWrap: state.allowWrap,
  };
};
