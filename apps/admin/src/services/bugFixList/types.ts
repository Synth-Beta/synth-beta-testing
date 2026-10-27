export type BugTaskStatus = 'open' | 'fixed';

export type AdminBugTask = {
  id: string;
  description: string;
  authorId: string;
  authorName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  status: BugTaskStatus;
  createdAt: string;
  fixedAt: string | null;
};

export type AdminBugTaskRow = {
  id: string;
  description: string;
  author_id: string;
  assignee_id: string | null;
  status: BugTaskStatus;
  created_at: string;
  fixed_at: string | null;
};
