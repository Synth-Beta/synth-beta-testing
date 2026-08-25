/**
 * Synth 2.0 Home first viewport: brand + CMO-approved hero copy + CTA group.
 * Featured-show plane lives in FeaturedThisWeekSection below.
 */
import React from 'react';
import { SYNTH_20_COPY, navigateSynthView } from '@/config/synth20Demo';

interface HomeHeroSectionProps {
  onSeeThisWeek?: () => void;
  onOpenChats?: () => void;
}

export const HomeHeroSection: React.FC<HomeHeroSectionProps> = ({
  onSeeThisWeek,
  onOpenChats,
}) => {
  const { hero } = SYNTH_20_COPY;

  const handlePrimary = () => {
    if (onSeeThisWeek) {
      onSeeThisWeek();
      return;
    }
    const el = document.getElementById('synth20-featured-week');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSecondary = () => {
    if (onOpenChats) {
      onOpenChats();
      return;
    }
    navigateSynthView('chat');
  };

  return (
    <section
      aria-label="Home hero"
      style={{
        marginBottom: 'var(--spacing-medium, 24px)',
        paddingLeft: 'var(--spacing-small, 12px)',
        paddingRight: 'var(--spacing-small, 12px)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--brand-pink-500)',
        }}
      >
        {hero.eyebrow}
      </p>
      <h1
        style={{
          margin: '8px 0 0',
          fontFamily: 'var(--font-family)',
          fontSize: 'clamp(28px, 6vw, 36px)',
          fontWeight: 700,
          lineHeight: 1.15,
          color: 'var(--neutral-900)',
        }}
      >
        {hero.headline}
      </h1>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: 15,
          lineHeight: 1.45,
          color: 'var(--neutral-600)',
          maxWidth: 480,
        }}
      >
        {hero.support}
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 16,
        }}
      >
        <button
          type="button"
          onClick={handlePrimary}
          style={{
            border: 'none',
            borderRadius: 999,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'var(--brand-pink-500)',
            color: '#fff',
          }}
        >
          {hero.primaryCta}
        </button>
        <button
          type="button"
          onClick={handleSecondary}
          style={{
            border: '1.5px solid var(--neutral-300)',
            borderRadius: 999,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'var(--neutral-0, #fff)',
            color: 'var(--neutral-900)',
          }}
        >
          {hero.secondaryCta}
        </button>
      </div>
    </section>
  );
};

export default HomeHeroSection;
