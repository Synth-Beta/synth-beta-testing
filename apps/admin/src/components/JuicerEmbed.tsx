import { useEffect } from 'react';
import { cn } from '@/lib/utils';

const JUICER_SCRIPT_SRC =
  'https://www.juicer.io/embed/getsynth-app/embed-code.js';

type JuicerEmbedProps = {
  className?: string;
};

/**
 * Juicer social feed — loads their script once (SPA-safe) and renders the feed target element.
 */
export function JuicerEmbed({ className }: JuicerEmbedProps) {
  useEffect(() => {
    if (document.querySelector(`script[src="${JUICER_SCRIPT_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = JUICER_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div
      className={cn(
        'w-full max-w-5xl mx-auto mt-12 min-h-[320px]',
        className
      )}
    >
      <ul className="juicer-feed" data-feed-id="getsynth-app" />
    </div>
  );
}
