import { Label } from '@/components/ui/label';
import {
  OPTIONAL_SCENE_ROOM_2_ENABLED,
  ONBOARDING_PREFERENCE_OPTIONS,
  OPTIONAL_SCENE_ROOM,
  REQUIRED_SCENE_ROOM,
  isDcCity,
  type FeaturedShowCandidate,
  type OnboardingPreferenceId,
} from '@synth/shared';

export type DensityPreferenceValue = {
  preference: OnboardingPreferenceId | null;
  joinOptionalRoom2: boolean;
  markFeaturedInterested: boolean;
};

interface DensityPreferenceStepProps {
  locationCity: string | null | undefined;
  value: DensityPreferenceValue;
  onChange: (value: DensityPreferenceValue) => void;
  suggestedShow: FeaturedShowCandidate | null;
  preferenceError?: string | null;
}

/**
 * Density onboarding: one preference pick + optional room 2 / show interest.
 * Room 1 (This week in DC) is auto-joined in the submit path, not listed as a pick.
 */
export function DensityPreferenceStep({
  locationCity,
  value,
  onChange,
  suggestedShow,
  preferenceError,
}: DensityPreferenceStepProps) {
  const dc = isDcCity(locationCity);
  const offerRoom2 = OPTIONAL_SCENE_ROOM_2_ENABLED && dc;

  if (!dc) {
    return (
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">DC scene rooms</h2>
        <p className="text-[15px] font-medium leading-[1.5] text-muted-foreground">
          Density rooms are tuned for Washington, DC right now. You can keep going.
          We will skip auto-join until your city is DC.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Land in tonight&apos;s rooms</h2>
        <p className="text-[15px] font-medium leading-[1.5] text-muted-foreground">
          You will join <span className="text-foreground">{REQUIRED_SCENE_ROOM.name}</span> before
          Home. Pick one vibe so we can suggest a show or an optional second room.
          Never more than two.
        </p>
      </div>

      <div className="space-y-3" role="radiogroup" aria-label="Scene preference">
        {ONBOARDING_PREFERENCE_OPTIONS.map((opt) => {
          const selected = value.preference === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() =>
                onChange({
                  ...value,
                  preference: opt.id,
                })
              }
              className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-white hover:bg-muted/40'
              }`}
            >
              <div className="font-semibold text-[16px]">{opt.label}</div>
              <div className="text-[14px] text-muted-foreground mt-0.5">{opt.description}</div>
            </button>
          );
        })}
        {preferenceError && (
          <p className="text-[15px] font-medium leading-[1.5] text-destructive">{preferenceError}</p>
        )}
      </div>

      {value.preference && suggestedShow && (
        <div className="rounded-xl border border-border bg-white px-4 py-3 space-y-3">
          <div>
            <div className="text-[13px] uppercase tracking-wide text-muted-foreground">
              Suggested show
            </div>
            <div className="font-semibold text-[16px] mt-1">
              {suggestedShow.artist_name || suggestedShow.title || 'Featured show'}
            </div>
            <div className="text-[14px] text-muted-foreground">
              {[suggestedShow.venue_name, suggestedShow.venue_city].filter(Boolean).join(' · ')}
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={value.markFeaturedInterested}
              onChange={(e) =>
                onChange({ ...value, markFeaturedInterested: e.target.checked })
              }
            />
            <span className="text-[15px] font-medium leading-[1.5]">
              Mark me interested in this show
            </span>
          </label>
        </div>
      )}

      {offerRoom2 && value.preference && (
        <div className="space-y-2">
          <Label htmlFor="optional_room_2">Optional room</Label>
          <label
            htmlFor="optional_room_2"
            className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-white px-4 py-3"
          >
            <input
              id="optional_room_2"
              type="checkbox"
              className="mt-1"
              checked={value.joinOptionalRoom2}
              onChange={(e) =>
                onChange({ ...value, joinOptionalRoom2: e.target.checked })
              }
            />
            <span>
              <span className="font-semibold text-[16px] block">{OPTIONAL_SCENE_ROOM.name}</span>
              <span className="text-[14px] text-muted-foreground">
                Opt in only. You stay in two rooms max.
              </span>
            </span>
          </label>
        </div>
      )}
    </section>
  );
}
