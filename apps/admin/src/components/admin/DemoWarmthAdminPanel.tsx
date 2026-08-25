import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_DEMO_SEED_LIVE_KEYS,
  SCENE_ROOM_IDS,
  ensureDensityDemoChats,
  fetchDemoWarmthRoomDirectory,
  publishDemoSeedLiveSet,
  setChatSeedLive,
  syncFeaturedShowChatsForWeek,
  archiveFeaturedShowChatsPastDoors,
} from "@synth/shared";

type RoomRow = {
  chatId: string;
  chatKey: string;
  chatName?: string;
  demoSeedLive?: boolean;
  homeEligible?: boolean;
  chatKind?: string;
};

export function DemoWarmthAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scenes, setScenes] = useState<RoomRow[]>([]);
  const [shows, setShows] = useState<RoomRow[]>([]);
  const [liveKeys, setLiveKeys] = useState<string[]>([...DEFAULT_DEMO_SEED_LIVE_KEYS]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await ensureDensityDemoChats(supabase);
      const { data, error } = await fetchDemoWarmthRoomDirectory(supabase);
      if (error) throw new Error(error);
      const sceneRows = Array.isArray(data?.scenes) ? (data!.scenes as RoomRow[]) : [];
      const showRows = Array.isArray(data?.featuredShowChats)
        ? (data!.featuredShowChats as RoomRow[])
        : [];
      setScenes(sceneRows);
      setShows(showRows);
      setLiveKeys(
        [...sceneRows, ...showRows].filter((r) => r.demoSeedLive).map((r) => r.chatKey)
      );
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load warmth directory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleKey = async (key: string, live: boolean) => {
    setBusy(true);
    try {
      const { error } = await setChatSeedLive(supabase, key, live);
      if (error) throw new Error(error);
      const next = live
        ? Array.from(new Set([...liveKeys, key]))
        : liveKeys.filter((k) => k !== key);
      setLiveKeys(next);
      await publishDemoSeedLiveSet(supabase, next);
      await load();
      setMessage(`Seed live ${live ? "on" : "off"} for ${key}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setBusy(false);
    }
  };

  const syncFeatured = async () => {
    setBusy(true);
    try {
      const { data, error } = await syncFeaturedShowChatsForWeek(supabase);
      if (error) throw new Error(error);
      await load();
      setMessage(`Synced featured show chats: ${JSON.stringify(data?.provisionedCount ?? 0)}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const runArchive = async () => {
    setBusy(true);
    try {
      const { data, error } = await archiveFeaturedShowChatsPastDoors(supabase);
      if (error) throw new Error(error);
      await load();
      setMessage(`Archived ${data?.archivedCount ?? 0} past-doors show chats`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setBusy(false);
    }
  };

  const RoomList = ({ rows }: { rows: RoomRow[] }) => (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.chatId} className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{r.chatName || r.chatKey}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">{r.chatKey}</div>
            <div className="text-[11px] text-muted-foreground font-mono truncate">{r.chatId}</div>
            <div className="mt-1 flex gap-2">
              <Badge variant={r.homeEligible ? "default" : "outline"}>
                {r.homeEligible ? "homeEligible" : "hidden on Home"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor={`seed-${r.chatKey}`} className="text-xs">
              Seed live
            </Label>
            <Switch
              id={`seed-${r.chatKey}`}
              checked={Boolean(r.demoSeedLive)}
              disabled={busy}
              onCheckedChange={(v) => void toggleKey(r.chatKey, v)}
            />
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Demo warmth (LOI-597)</CardTitle>
            <CardDescription>
              Persistent rooms {SCENE_ROOM_IDS.THIS_WEEK_IN_DC} and {SCENE_ROOM_IDS.GOING_OUT}.
              Mark seed live for the warmth gate. Home hides under-gate chats.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || busy}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void syncFeatured()} disabled={busy}>
              Sync Curator pin chats
            </Button>
            <Button variant="outline" onClick={() => void runArchive()} disabled={busy}>
              Archive 48h past doors
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scene rooms</CardTitle>
          <CardDescription>Joinable product keys for hosting (≥40 / ≥25 membership targets).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <RoomList rows={scenes} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Featured-show chats</CardTitle>
          <CardDescription>1:1 with Curator pins (featured_show:week:event) plus FIX slots.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : shows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No show chats yet. Sync Curator pins or ensure density demo chats.</p>
          ) : (
            <RoomList rows={shows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
