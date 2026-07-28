import * as React from 'react';

import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type RecentPostRow = {
  platform: string;
  date: string;
  caption: string;
  reach: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagementRate: string | null;
};

export interface RecentPostsTableProps {
  data: RecentPostRow[];
}

const RecentPostsTable = ({ data }: RecentPostsTableProps) => (
  <Card className="shadow-sm border border-slate-200 bg-white">
    <CardHeader>
      <CardTitle>Recent Posts</CardTitle>
      <CardDescription className="text-xs text-muted-foreground">Last week</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      <div className="max-h-[420px] overflow-auto">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0">
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Platform</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Date</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Caption</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Views/Reach</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Likes</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Comments</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Shares</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Saves</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">
                Engagement Rate
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(post => (
              <TableRow key={`${post.platform}-${post.date}-${post.caption.slice(0, 10)}`}>
                <TableCell className="text-sm font-medium">{post.platform}</TableCell>
                <TableCell className="text-sm">{post.date}</TableCell>
                <TableCell className="text-sm max-w-[220px]">
                  <p className="truncate">{post.caption}</p>
                </TableCell>
                <TableCell className="text-sm">{post.reach ?? 'N/A'}</TableCell>
                <TableCell className="text-sm text-right">
                  {post.likes != null ? post.likes.toLocaleString() : 'N/A'}
                </TableCell>
                <TableCell className="text-sm text-right">
                  {post.comments != null ? post.comments.toLocaleString() : 'N/A'}
                </TableCell>
                <TableCell className="text-sm text-right">
                  {post.shares != null ? post.shares.toLocaleString() : 'N/A'}
                </TableCell>
                <TableCell className="text-sm text-right">
                  {post.saves != null ? post.saves.toLocaleString() : 'N/A'}
                </TableCell>
                <TableCell className="text-sm text-right font-semibold">
                  {post.engagementRate ?? 'N/A'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
);

export default RecentPostsTable;