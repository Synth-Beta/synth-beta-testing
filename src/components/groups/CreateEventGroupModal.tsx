/**
 * Create Event Group Modal
 * Create community groups for events with integrated chat
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Users, Loader2, Lock, Globe, Calendar } from 'lucide-react';
import EventGroupService from '@/services/eventGroupService';

interface CreateEventGroupModalProps {
  open: boolean;
  onClose: () => void;
  event: {
    id: string;
    title: string;
    artist_name: string;
    event_date: string;
  };
  onGroupCreated?: (groupId: string) => void;
}

export function CreateEventGroupModal({
  open,
  onClose,
  event,
  onGroupCreated,
}: CreateEventGroupModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_public: true,
    max_members: '',
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Group name required',
        description: 'Please enter a name for your group',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const groupId = await EventGroupService.createGroup({
        event_id: event.id,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        is_public: formData.is_public,
        max_members: formData.max_members ? parseInt(formData.max_members) : undefined,
      });

      toast({
        title: 'Group Created! 🎉',
        description: `${formData.name} is ready for members`,
      });

      onGroupCreated?.(groupId);
      handleClose();
    } catch (error) {
      console.error('Error creating group:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create group',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        name: '',
        description: '',
        is_public: true,
        max_members: '',
      });
      onClose();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600" />
            Create Event Group
          </DialogTitle>
          <DialogDescription>
            Start a community for this event. Chat, share plans, and meet up!
          </DialogDescription>
        </DialogHeader>

        {/* Event Info */}
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <p className="font-semibold text-sm mb-1">{event.title}</p>
          <div className="flex items-center gap-2 text-xs text-gray-700">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(event.event_date)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Group Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Group Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g., Taylor Swift Squad, VIP Section Crew"
              value={formData.name}
              onChange={handleInputChange}
              disabled={isSubmitting}
              maxLength={50}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="What's this group about?"
              value={formData.description}
              onChange={handleInputChange}
              disabled={isSubmitting}
              rows={3}
              maxLength={200}
            />
          </div>

          {/* Privacy */}
          <div className="space-y-3">
            <Label>Privacy</Label>
            <div className="space-y-2">
              <label className="flex items-start p-3 border rounded-lg cursor-pointer">
                <input
                  type="radio"
                  name="privacy"
                  checked={formData.is_public}
                  onChange={() => setFormData((prev) => ({ ...prev, is_public: true }))}
                  disabled={isSubmitting}
                  className="mt-0.5 mr-3"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-sm">Public</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Anyone can find and join this group
                  </p>
                </div>
              </label>

              <label className="flex items-start p-3 border rounded-lg cursor-pointer">
                <input
                  type="radio"
                  name="privacy"
                  checked={!formData.is_public}
                  onChange={() => setFormData((prev) => ({ ...prev, is_public: false }))}
                  disabled={isSubmitting}
                  className="mt-0.5 mr-3"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-sm">Private</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Only you can invite members
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Max Members */}
          <div className="space-y-2">
            <Label htmlFor="max_members">Max Members (Optional)</Label>
            <Input
              id="max_members"
              name="max_members"
              type="number"
              placeholder="Leave blank for unlimited"
              value={formData.max_members}
              onChange={handleInputChange}
              disabled={isSubmitting}
              min="2"
              max="100"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.name.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 mr-2" />
                  Create Group
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateEventGroupModal;

