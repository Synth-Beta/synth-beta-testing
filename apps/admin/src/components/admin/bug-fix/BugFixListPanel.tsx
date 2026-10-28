import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Bug, CheckCircle2, Loader2, UserMinus, UserPlus } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  claimBugTask,
  createBugTask,
  fetchCurrentAdminProfile,
  listBugTasks,
  markBugTaskFixed,
  unclaimBugTask,
  unfixBugTask,
} from '@/services/bugFixList/bugFixListService';
import type { AdminBugTask } from '@/services/bugFixList/types';
import { adminDisplayName, adminOutlineColor } from './adminIdentity';

type BugTab = 'all' | 'mine' | 'fixed';

function BugTaskCard({
  task,
  actions,
}: {
  task: AdminBugTask;
  actions: ReactNode;
}) {
  const outline = adminOutlineColor(task.authorName);
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border-2 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: outline }}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground whitespace-pre-wrap">{task.description}</p>
        <p className="text-xs text-muted-foreground">{adminDisplayName(task.authorName)}</p>
        {task.assigneeId ? (
          <p className="text-xs text-muted-foreground">
            {task.status === 'fixed'
              ? `Fixed by ${adminDisplayName(task.assigneeName)}`
              : `Claimed by ${adminDisplayName(task.assigneeName)}`}
            {task.status === 'fixed' && task.fixedAt
              ? ` · ${format(new Date(task.fixedAt), 'MMM d, yyyy')}`
              : null}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function BugFixListPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<BugTab>('all');
  const [tasks, setTasks] = useState<AdminBugTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, profile] = await Promise.all([
        listBugTasks(),
        user?.id ? fetchCurrentAdminProfile(user.id) : Promise.resolve(null),
      ]);
      setTasks(list);
      setAdminName(profile?.name ?? null);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load bug list.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openTasks = useMemo(() => tasks.filter((t) => t.status === 'open'), [tasks]);
  const myTasks = useMemo(
    () => openTasks.filter((t) => t.assigneeId && user?.id && t.assigneeId === user.id),
    [openTasks, user?.id],
  );
  const fixedTasks = useMemo(() => tasks.filter((t) => t.status === 'fixed'), [tasks]);

  const upsertTask = (updated: AdminBugTask) => {
    setTasks((prev) => {
      const without = prev.filter((t) => t.id !== updated.id);
      return [updated, ...without].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.id || !description.trim()) return;
    setSubmitting(true);
    try {
      const created = await createBugTask(description, user.id);
      upsertTask(created);
      setDescription('');
      toast({ title: 'Bug submitted', description: 'Added to the All list.' });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to submit bug.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (taskId: string, action: () => Promise<AdminBugTask>, success: string) => {
    if (!user?.id) return;
    setBusyId(taskId);
    try {
      const updated = await action();
      upsertTask(updated);
      toast({ title: success });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Action failed.',
        variant: 'destructive',
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const identityColor = adminOutlineColor(adminName);
  const identityLabel = adminDisplayName(adminName);

  const renderAllActions = (task: AdminBugTask) => {
    if (!user?.id) return null;
    if (!task.assigneeId) {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={busyId === task.id}
          onClick={() =>
            void runAction(task.id, () => claimBugTask(task.id, user.id), 'Claimed')
          }
        >
          {busyId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Claim
        </Button>
      );
    }
    if (task.assigneeId === user.id) {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={busyId === task.id}
          onClick={() =>
            void runAction(task.id, () => unclaimBugTask(task.id, user.id), 'Unclaimed')
          }
        >
          {busyId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-4 w-4" />}
          Unclaim
        </Button>
      );
    }
    return null;
  };

  const renderMineActions = (task: AdminBugTask) => {
    if (!user?.id) return null;
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          disabled={busyId === task.id}
          onClick={() =>
            void runAction(task.id, () => unclaimBugTask(task.id, user.id), 'Unclaimed')
          }
        >
          {busyId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-4 w-4" />}
          Unclaim
        </Button>
        <Button
          size="sm"
          disabled={busyId === task.id}
          onClick={() =>
            void runAction(task.id, () => markBugTaskFixed(task.id, user.id), 'Marked as fixed')
          }
        >
          {busyId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Mark as Fixed
        </Button>
      </>
    );
  };

  const renderFixedActions = (task: AdminBugTask) => (
    <Button
      size="sm"
      variant="outline"
      disabled={busyId === task.id}
      onClick={() => void runAction(task.id, () => unfixBugTask(task.id), 'Reopened')}
    >
      {busyId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Undo Fixed
    </Button>
  );

  const emptyMessage = (label: string) => (
    <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Bug Fix List
          </CardTitle>
          <CardDescription>
            Submit bugs, claim work, and track fixes across the admin team.
            {adminName ? (
              <>
                {' '}
                Signed in as{' '}
                <span className="font-medium" style={{ color: identityColor }}>
                  {identityLabel}
                </span>
                .
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="bug-description">
                Describe a bug
              </label>
              <Textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What broke, where, and how to reproduce…"
                rows={3}
              />
            </div>
            <Button type="submit" disabled={submitting || !description.trim()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit
            </Button>
          </form>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as BugTab)} className="w-full">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="mine">My To-Dos</TabsTrigger>
          <TabsTrigger value="fixed">Fixed</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : openTasks.length === 0 ? (
            emptyMessage('No open bugs yet.')
          ) : (
            openTasks.map((task) => (
              <BugTaskCard key={task.id} task={task} actions={renderAllActions(task)} />
            ))
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : myTasks.length === 0 ? (
            emptyMessage('Nothing claimed yet. Claim a bug from All.')
          ) : (
            myTasks.map((task) => (
              <BugTaskCard key={task.id} task={task} actions={renderMineActions(task)} />
            ))
          )}
        </TabsContent>

        <TabsContent value="fixed" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : fixedTasks.length === 0 ? (
            emptyMessage('No fixed bugs yet.')
          ) : (
            fixedTasks.map((task) => (
              <BugTaskCard key={task.id} task={task} actions={renderFixedActions(task)} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BugFixListPanel;
