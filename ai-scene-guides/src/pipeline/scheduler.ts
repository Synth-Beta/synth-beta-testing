import type { AiGuidePersona, SceneGuidesRuntimeSettings } from '../types.js';

export function selectDailyPersonas(options: {
  catalog: AiGuidePersona[];
  settings: SceneGuidesRuntimeSettings;
  recentlyPostedPersonaIds?: Set<string>;
  now?: Date;
  roomTimezoneOffsetHours?: number;
}): AiGuidePersona[] {
  const {
    catalog,
    settings,
    recentlyPostedPersonaIds = new Set(),
    now = new Date(),
    roomTimezoneOffsetHours = -4,
  } = options;

  const localHour = (now.getUTCHours() + roomTimezoneOffsetHours + 24) % 24;
  const { startHour, endHour } = settings.quietHours;
  const inQuiet =
    startHour < endHour
      ? localHour >= startHour && localHour < endHour
      : localHour >= startHour || localHour < endHour;
  if (inQuiet) return [];

  const eligible = catalog.filter(
    (p) => p.isActive && !recentlyPostedPersonaIds.has(p.id),
  );

  // Prefer diverse archetypes
  const byArchetype = new Map<string, AiGuidePersona[]>();
  for (const p of eligible) {
    const list = byArchetype.get(p.archetype) ?? [];
    list.push(p);
    byArchetype.set(p.archetype, list);
  }

  const min = settings.activePersonaCountMin;
  const max = settings.activePersonaCountMax;
  const target = Math.min(max, Math.max(min, Math.min(max, byArchetype.size)));

  const selected: AiGuidePersona[] = [];
  const archetypes = [...byArchetype.keys()].sort();
  for (const arch of archetypes) {
    if (selected.length >= target) break;
    const pool = byArchetype.get(arch)!;
    selected.push(pool[0]!);
  }

  // Fill if needed
  for (const p of eligible) {
    if (selected.length >= target) break;
    if (!selected.some((s) => s.id === p.id)) selected.push(p);
  }

  return selected.slice(0, target);
}
