import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface InviteCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MASTER_INVITE_CODE = 'SYNTH2025';
const STORAGE_KEY = 'synth_invite_code';

export const InviteCodeModal = ({ isOpen, onClose, onSuccess }: InviteCodeModalProps) => {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    setIsValidating(true);
    setError('');

    // Simulate validation delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (inviteCode.trim().toUpperCase() === MASTER_INVITE_CODE.toUpperCase()) {
      // Store the invite code in localStorage
      localStorage.setItem(STORAGE_KEY, inviteCode.trim().toUpperCase());
      
      // Call success callback if provided, otherwise navigate to app
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
        navigate('/app');
      }
    } else {
      setError('Invalid invite code. Please check and try again.');
    }

    setIsValidating(false);
  };

  const handleClose = () => {
    setInviteCode('');
    setError('');
    setIsValidating(false);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="synth-heading text-2xl text-center">
            Request Access
          </DialogTitle>
          <DialogDescription className="synth-text text-center text-muted-foreground">
            Enter your invite code to access the Synth platform
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="invite-code" className="synth-text font-medium">
              Invite Code
            </Label>
            <Input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your invite code"
              className="synth-input"
              disabled={isValidating}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center space-x-2 text-red-500 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={isValidating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="synth"
              className="flex-1 hover-button"
              disabled={isValidating || !inviteCode.trim()}
            >
              {isValidating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Validating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Access App
                </>
              )}
            </Button>
          </div>
        </form>

        <div className="text-center">
          <p className="synth-text text-xs text-muted-foreground">
            Don't have an invite code? Contact us to request access.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InviteCodeModal;
