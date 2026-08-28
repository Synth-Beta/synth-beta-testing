/**
 * Above-the-fold brand + week framing for DC density Home (LOI-571 AC-1).
 * Copy from CMO-approved LOI-553 (SYNTH_20_HOME.hero).
 */
import React from 'react';
import { SYNTH_20_DEMO, SYNTH_20_HOME } from '@/config/synth20Demo';

interface HomeDensityHeroProps {
  onPrimary?: () => void;
  onSecondary?: () => void;
}

export const HomeDensityHero: React.FC<HomeDensityHeroProps> = ({
  onPrimary,
  onSecondary,
}) => {
  if (!SYNTH_20_DEMO) return null;
  const copy = SYNTH_20_HOME.hero;

  return (
    <section
      data-testid="home-density-hero"
      aria-label={copy.headline}
      style={{
        marginBottom: 'var(--spacing-medium, 24px)',
        paddingLeft: 'var(--spacing-small, 12px)',
        paddingRight: 'var(--spacing-small, 12px)',
      }}
    >
      <div
        style={{
          borderRadius: 20,
          padding: '20px 18px',
          background:
            'linear-gradient(145deg, rgba(233,30,140,0.12) 0%, rgba(255,255,255,0.95) 55%, rgba(20,20,20,0.04) 100%)',
          border: '1px solid var(--neutral-150, #ebebeb)',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--brand-pink-500, #e91e8c)',
            marginBottom: 8,
          }}
        >
          Synth · {copy.eyebrow}
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'clamp(26px, 5vw, 34px)',
            fontWeight: 800,
            color: 'var(--neutral-900)',
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {copy.headline}
        </h1>
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 15,
            lineHeight: 1.45,
            color: 'var(--neutral-600)',
            maxWidth: 520,
          }}
        >
          {copy.support}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onPrimary}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 700,
              background: 'var(--brand-pink-500, #e91e8c)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {copy.primaryCta}
          </button>
          <button
            type="button"
            onClick={onSecondary}
            style={{
              border: '1px solid var(--neutral-200)',
              borderRadius: 999,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              background: 'var(--neutral-0, #fff)',
              color: 'var(--neutral-800)',
              cursor: 'pointer',
            }}
          >
            {copy.secondaryCta}
          </button>
        </div>
      </div>
    </section>
  );
};

export default HomeDensityHero;
