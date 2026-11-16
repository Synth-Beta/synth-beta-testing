/**
 * The onboarding profile save runs in the background after Continue, so the next screen
 * opens instantly. The last onboarding step awaits it before completing onboarding, so a
 * user can never finish without a saved profile. A failed save is retried on each await.
 */
export class ProfileSaveError extends Error {
  constructor(readonly cause: unknown) {
    super('profile_save_failed');
    this.name = 'ProfileSaveError';
  }
}

let pending: Promise<void> | null = null;
let run: (() => Promise<void>) | null = null;

function start() {
  if (!run) return;
  pending = run();
  pending.catch(() => {}); // awaited later; avoid an unhandled rejection in the meantime
}

export function startProfileSave(save: () => Promise<void>): void {
  run = save;
  start();
}

export async function awaitProfileSave(): Promise<void> {
  if (!pending) return;
  try {
    await pending;
  } catch {
    start(); // one immediate retry (network blips are the common failure)
    try {
      await pending;
    } catch (e) {
      throw new ProfileSaveError(e);
    }
  }
  pending = null;
  run = null;
}
