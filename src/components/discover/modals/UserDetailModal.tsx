import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ProfileView } from '@/components/profile/ProfileView';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { BlockUserModal } from '@/components/moderation/BlockUserModal';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Flag, UserX } from 'lucide-react';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  isOpen,
  onClose,
  userId,
  currentUserId,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 overflow-hidden" hideCloseButton>
          <div className="h-full overflow-y-auto">
            <div className="sticky top-0 bg-background border-b z-10 p-4 flex items-center justify-between">
              <Button variant="ghost" onClick={onClose}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReportModalOpen(true)}
                >
                  <Flag className="w-4 h-4 mr-2" />
                  Report
                </Button>
                {userId !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBlockModalOpen(true)}
                  >
                    <UserX className="w-4 h-4 mr-2" />
                    Block
                  </Button>
                )}
              </div>
            </div>
            <ProfileView
              currentUserId={currentUserId}
              profileUserId={userId}
              onBack={onClose}
              onEdit={() => {}}
              onSettings={() => {}}
              onNavigateToProfile={onNavigateToProfile}
              onNavigateToChat={onNavigateToChat}
            />
          </div>
        </DialogContent>
      </Dialog>

      {reportModalOpen && (
        <ReportContentModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          contentType="user"
          contentId={userId}
          contentTitle="User Profile"
        />
      )}

      {blockModalOpen && (
        <BlockUserModal
          open={blockModalOpen}
          onClose={() => setBlockModalOpen(false)}
          user={{ user_id: userId } as any}
          onBlockToggled={() => {
            setBlockModalOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
};

