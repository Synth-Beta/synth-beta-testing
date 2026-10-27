import { useRef, useState } from 'react';
import { Loader2, Radio, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  LASTFM_SPOTIFY_TIP,
  SPOTIFY_EXPORT_STEPS,
  SPOTIFY_EXPORT_URL,
  type MusicImportSource,
} from '@synth/shared';
import { importMusic, summarizeSpotifyExportFiles } from '@/services/musicImportActions';

/**
 * Last.fm + Spotify-export connect, for everyone who can't use Spotify OAuth.
 * Mirrors mobile/src/components/streaming/MusicImportOptions.tsx.
 */
export function MusicImportOptions({
  onImported,
  showExport = true,
}: {
  onImported: (source: MusicImportSource) => void;
  /** Onboarding hides it: the export takes days to arrive. */
  showExport?: boolean;
}) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState<MusicImportSource | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const connectLastfm = async () => {
    if (!username.trim() || busy) return;
    setBusy('lastfm');
    setNote(null);
    try {
      const result = await importMusic({ source: 'lastfm', username });
      if (!result.ok) return setNote({ text: result.message ?? 'Import failed. Try again.', error: true });
      setNote({ text: `Last.fm connected · ${result.counts?.artists ?? 0} artists imported.`, error: false });
      onImported('lastfm');
    } finally {
      setBusy(null);
    }
  };

  const uploadExport = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    setBusy('spotify-export');
    setNote(null);
    try {
      const summary = await summarizeSpotifyExportFiles(files);
      if (!summary) {
        return setNote({
          text: 'No music plays found. Pick the zip from Spotify\'s "Account data" email (or the StreamingHistory files inside it).',
          error: true,
        });
      }
      const result = await importMusic({ source: 'spotify-export', summary });
      if (!result.ok) return setNote({ text: result.message ?? 'Import failed. Try again.', error: true });
      setNote({ text: `Spotify data imported · ${summary.totalPlays.toLocaleString()} plays read.`, error: false });
      onImported('spotify-export');
    } catch {
      setNote({ text: "Couldn't read that file. Try the zip exactly as Spotify sent it.", error: true });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-4 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Radio className="w-4 h-4 text-[#D51007]" />
          Last.fm
        </div>
        <p className="text-xs text-muted-foreground">{LASTFM_SPOTIFY_TIP}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void connectLastfm();
          }}
        >
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Last.fm username"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Last.fm username"
            className="h-9"
          />
          <Button
            type="submit"
            size="sm"
            className="bg-[#D51007] hover:bg-[#b30d06] text-white"
            disabled={!username.trim() || busy !== null}
          >
            {busy === 'lastfm' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
          </Button>
        </form>
        <a href="https://www.last.fm/join" target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline">
          Create a free Last.fm account
        </a>
      </div>

      {showExport ? (
        <div className="rounded-xl border p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Upload className="w-4 h-4 text-[#1DB954]" />
            Upload your Spotify data
          </div>
          <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-0.5">
            {SPOTIFY_EXPORT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => fileInput.current?.click()}
            >
              {busy === 'spotify-export' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Choose file'}
            </Button>
            <a href={SPOTIFY_EXPORT_URL} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline">
              Request my Spotify data
            </a>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            multiple
            hidden
            onChange={(e) => void uploadExport(Array.from(e.target.files ?? []))}
          />
        </div>
      ) : null}

      {note ? (
        <p role="status" className={`text-xs ${note.error ? 'text-muted-foreground' : 'text-emerald-700'}`}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
