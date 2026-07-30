import brandSkill from '../../bundle/synth-brand/SKILL.md?raw';
import brandTokens from '../../bundle/synth-brand/reference/brand-tokens.css?raw';
import brandTailwind from '../../bundle/synth-brand/reference/tailwind-brand.js?raw';
import brandFonts from '../../bundle/synth-brand/reference/google-fonts.html?raw';
import writingGuide from '../../bundle/synth-brand/reference/writing-style-guide.md?raw';
import productSkill from '../../bundle/synth-product/SKILL.md?raw';
import productSources from '../../bundle/synth-product/reference/sources.md?raw';
import nicheAndDistribution from '../../bundle/synth-product/reference/niche-and-distribution.md?raw';
import aiSkill from '../../bundle/synth-ai-dev-guide/SKILL.md?raw';
import aiWritingGuide from '../../bundle/synth-ai-dev-guide/reference/writing-style-guide.md?raw';
import bundleReadme from '../../bundle/README.md?raw';

/** Text files packaged into the downloadable skills bundle. */
export const TEXT_BUNDLE_FILES: Record<string, string> = {
  'README.md': bundleReadme,
  'synth-brand/SKILL.md': brandSkill,
  'synth-brand/reference/brand-tokens.css': brandTokens,
  'synth-brand/reference/tailwind-brand.js': brandTailwind,
  'synth-brand/reference/google-fonts.html': brandFonts,
  'synth-brand/reference/writing-style-guide.md': writingGuide,
  'synth-product/SKILL.md': productSkill,
  'synth-product/reference/sources.md': productSources,
  'synth-product/reference/niche-and-distribution.md': nicheAndDistribution,
  'synth-ai-dev-guide/SKILL.md': aiSkill,
  'synth-ai-dev-guide/reference/writing-style-guide.md': aiWritingGuide,
};

export const LOGO_PUBLIC_PATHS = [
  'Main logo black background.png',
  'Main Lolo White background.png',
  'Backup Logo - with crowd (BLACK BACKGROUND).png',
  'Backup vector. with crowd.png',
] as const;

export function buildLlmsShort(): string {
  return [
    '# Synth',
    '',
    'Live music discovery and community. Letterboxd for live music.',
    'Brand primary: #CC2486. Font: Inter. Radius: 10px. Page bg: #FCFCFC.',
    'Mobile primary: Expo mobile/. Capacitor legacy.',
    'Admin gate: Supabase users.account_type = admin.',
    'Voice: synth-brand/reference/writing-style-guide.md (apply exactly).',
    'Full context: llms-full.txt + synth-skills-bundle.zip from styleguide.getsynth.app',
    '',
  ].join('\n');
}

export function buildLlmsFull(): string {
  const parts = [
    '# Synth Skills Bundle (llms-full)',
    '',
    'Internal. Download from styleguide.getsynth.app with an admin account.',
    'Install skill folders under .cursor/skills/ or .agents/skills/.',
    '',
  ];

  const skills: Array<{ name: string; body: string; extras?: Array<{ title: string; body: string }> }> = [
    {
      name: 'synth-brand',
      body: brandSkill,
      extras: [
        { title: 'reference/brand-tokens.css', body: `\`\`\`css\n${brandTokens}\n\`\`\`` },
        { title: 'reference/writing-style-guide.md', body: writingGuide },
      ],
    },
    {
      name: 'synth-product',
      body: productSkill,
      extras: [
        { title: 'reference/niche-and-distribution.md', body: nicheAndDistribution },
        { title: 'reference/sources.md', body: productSources },
      ],
    },
    {
      name: 'synth-ai-dev-guide',
      body: aiSkill,
      extras: [{ title: 'reference/writing-style-guide.md', body: aiWritingGuide }],
    },
  ];

  for (const skill of skills) {
    parts.push(`\n\n---\n\n# Skill: ${skill.name}\n\n`);
    parts.push(skill.body);
    for (const extra of skill.extras || []) {
      parts.push(`\n\n## ${extra.title}\n\n`);
      parts.push(extra.body);
      parts.push('\n');
    }
  }

  return parts.join('');
}
