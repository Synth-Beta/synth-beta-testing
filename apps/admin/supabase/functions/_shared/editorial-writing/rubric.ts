import type { LintResult, PlatformDraft, RubricScore } from './types';

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

/** Score draft using training guide §14 scorecard (heuristic QA). */
export function scoreDraft(draft: PlatformDraft, lint: LintResult): RubricScore {
  let accuracy = 25;
  let specificity = 15;
  let editorial_angle = 15;
  let platform_fit = 15;
  let reader_value = 10;
  let voice = 10;
  let sourcing = 5;
  let cta = 5;

  if (!lint.passed) accuracy = 0;
  else if ((draft.claims_used || []).length === 0) accuracy = 8;
  else if ((draft.claims_used || []).length === 1) accuracy = 18;

  const body = draft.body || '';
  const hasDate = /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(
    body,
  );
  const hasPlace = /\b(dc|washington|nw|street|club|venue|stage)\b/i.test(body);
  if (!hasDate && !hasPlace) specificity -= 8;
  else if (!hasDate || !hasPlace) specificity -= 3;
  if (/\b(iconic|vibrant|cornerstone|key player|vital hub)\b/i.test(body)) specificity -= 6;

  const paragraphs = body.split(/\n\s*\n/).filter(Boolean);
  if (paragraphs.length < 2) editorial_angle -= 5;
  if (/stands as one of the most|continues to be a cornerstone/i.test(body)) editorial_angle -= 10;

  if (draft.platform === 'instagram') {
    if ((draft.hashtags || []).length > 4) platform_fit -= 5;
    if (!draft.alt_text) platform_fit -= 3;
  }
  if (draft.platform === 'linkedin' && !/\?/.test(body)) platform_fit -= 4;
  if (draft.platform === 'reddit' && !/synth/i.test(body)) platform_fit -= 8;
  if (draft.platform === 'substack' && (draft.source_urls || []).length < 2) platform_fit -= 5;

  if (/share your thoughts|what do you think\?/i.test(body)) reader_value -= 5;
  if (/\?/.test(body) || (draft.cta && draft.cta.length > 8)) reader_value += 0;
  else reader_value -= 3;

  if (/[\u2014\u2013]/.test(body)) voice = 0;
  if (/in today's evolving|music has always brought/i.test(body)) voice -= 6;

  if ((draft.source_urls || []).length === 0) sourcing = 1;
  else if ((draft.source_urls || []).length >= 2) sourcing = 5;

  if (!draft.cta && !/\?/.test(body)) cta = 1;
  if (/\b(join us|download|sign up)\b/i.test(`${draft.cta || ''} ${body}`)) cta = 1;

  for (const w of lint.soft_warnings) {
    if (w.startsWith('Rewrite phrase')) specificity = Math.max(0, specificity - 1);
  }

  accuracy = clamp(accuracy, 25);
  specificity = clamp(specificity, 15);
  editorial_angle = clamp(editorial_angle, 15);
  platform_fit = clamp(platform_fit, 15);
  reader_value = clamp(reader_value, 10);
  voice = clamp(voice, 10);
  sourcing = clamp(sourcing, 5);
  cta = clamp(cta, 5);

  const total =
    accuracy + specificity + editorial_angle + platform_fit + reader_value + voice + sourcing + cta;

  let verdict: RubricScore['verdict'] = 'reject';
  if (!lint.passed) verdict = 'reject';
  else if (total >= 90) verdict = 'publishable';
  else if (total >= 80) verdict = 'light_edit';
  else if (total >= 70) verdict = 'structural_rewrite';
  else verdict = 'reject';

  return {
    total,
    breakdown: {
      accuracy,
      specificity,
      editorial_angle,
      platform_fit,
      reader_value,
      voice,
      sourcing,
      cta,
    },
    verdict,
  };
}
