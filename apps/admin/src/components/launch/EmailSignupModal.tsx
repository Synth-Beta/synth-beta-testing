import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Mail } from 'lucide-react';
import { LaunchEmailService } from '@/services/launchEmailService';

interface EmailSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailSignupModal = ({ isOpen, onClose }: EmailSignupModalProps) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setMessage('Please enter your email address');
      setIsSuccess(false);
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    const result = await LaunchEmailService.submitEmail(email);

    if (result.success) {
      setIsSuccess(true);
      setMessage(result.message);
      setEmail('');
      
      // Auto-close modal after 3 seconds on success
      setTimeout(() => {
        onClose();
        setIsSuccess(false);
        setMessage('');
      }, 3000);
    } else {
      setIsSuccess(false);
      setMessage(result.message);
    }

    setIsSubmitting(false);
  };

  const handleClose = () => {
    setEmail('');
    setMessage('');
    setIsSuccess(false);
    setIsSubmitting(false);
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
          <DialogTitle className="text-2xl text-center font-bold">
            Join the Waitlist
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Be the first to know when Synth launches
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="font-medium">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your email address"
                className="pl-10 h-12 text-base"
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          </div>

          {message && (
            <div className={`flex items-center space-x-2 text-sm ${
              isSuccess ? 'text-green-600' : 'text-red-500'
            }`}>
              {isSuccess ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>{message}</span>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-pink-600 hover:bg-pink-700 text-white"
              disabled={isSubmitting || !email.trim()}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Signing Up...
                </>
              ) : (
                'Join Waitlist'
              )}
            </Button>
          </div>
        </form>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            We'll only use your email to notify you about the launch. No spam, ever.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmailSignupModal;
