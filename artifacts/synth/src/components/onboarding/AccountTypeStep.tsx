import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Music, Building2, User } from 'lucide-react';

interface AccountTypeStepProps {
  onNext: (data: {
    accountType: 'user' | 'creator' | 'business';
    businessInfo?: Record<string, any>;
  }) => void;
  onBack: () => void;
  onSkip: () => void;
}

export const AccountTypeStep = ({ onNext, onBack, onSkip }: AccountTypeStepProps) => {
  const [accountType, setAccountType] = useState<'user' | 'creator' | 'business'>('user');
  const [showBusinessInfo, setShowBusinessInfo] = useState(false);
  const [businessInfo, setBusinessInfo] = useState({
    companyName: '',
    website: '',
    description: '',
  });

  const handleContinue = () => {
    if (accountType === 'user') {
      onNext({ accountType: 'user' });
    } else {
      setShowBusinessInfo(true);
    }
  };

  const handleSubmitBusinessInfo = () => {
    onNext({
      accountType,
      businessInfo: {
        company_name: businessInfo.companyName,
        website: businessInfo.website,
        description: businessInfo.description,
      },
    });
  };

  if (showBusinessInfo) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">
            {accountType === 'creator' ? 'Creator' : 'Business'} Information
          </h2>
          <p className="text-muted-foreground">
            Tell us about your {accountType === 'creator' ? 'artist profile' : 'business'}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">
              {accountType === 'creator' ? 'Artist/Band Name' : 'Company Name'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="companyName"
              placeholder={
                accountType === 'creator' ? 'Your artist or band name' : 'Your company name'
              }
              value={businessInfo.companyName}
              onChange={(e) =>
                setBusinessInfo({ ...businessInfo, companyName: e.target.value })
              }
              required
              className="bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website (Optional)</Label>
            <Input
              id="website"
              type="url"
              placeholder="https://..."
              value={businessInfo.website}
              onChange={(e) =>
                setBusinessInfo({ ...businessInfo, website: e.target.value })
              }
              className="bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder={
                accountType === 'creator'
                  ? 'Tell us about your music and what you do...'
                  : 'Tell us about your business...'
              }
              value={businessInfo.description}
              onChange={(e) =>
                setBusinessInfo({ ...businessInfo, description: e.target.value })
              }
              maxLength={500}
              className="bg-white"
            />
            <p className="text-xs text-muted-foreground text-right">
              {businessInfo.description.length}/500 characters
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              Request will be reviewed
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              Your request will be sent to our admin team for review. You'll be notified once
              it's approved. In the meantime, you can use Synth as a regular user.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBusinessInfo(false)}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleSubmitBusinessInfo}
              disabled={!businessInfo.companyName.trim()}
              className="flex-1"
            >
              Submit Request
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Choose Your Account Type</h2>
        <p className="text-muted-foreground">
          Select the type that best describes how you'll use Synth
        </p>
      </div>

      <RadioGroup value={accountType} onValueChange={(value: any) => setAccountType(value)}>
        <Card className={accountType === 'user' ? 'border-primary' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <RadioGroupItem value="user" id="user" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-primary" />
                  <Label htmlFor="user" className="text-lg font-semibold cursor-pointer">
                    User
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Discover events, connect with other music fans, and never go to shows alone.
                  Perfect for concert-goers and music lovers.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={accountType === 'creator' ? 'border-primary' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <RadioGroupItem value="creator" id="creator" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Music className="w-5 h-5 text-primary" />
                  <Label htmlFor="creator" className="text-lg font-semibold cursor-pointer">
                    Creator
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  For artists, bands, and labels. Get analytics on your fans, manage your
                  events, and grow your audience.
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Requires admin approval
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={accountType === 'business' ? 'border-primary' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <RadioGroupItem value="business" id="business" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  <Label htmlFor="business" className="text-lg font-semibold cursor-pointer">
                    Business
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  For venues, promoters, and advertisers. Create and manage events, run
                  campaigns, and reach your target audience.
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Requires admin approval
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </RadioGroup>

      <div className="flex gap-3 pt-4">
        <Button type="button" variant="ghost" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button type="button" variant="outline" onClick={onSkip} className="flex-1">
          Skip
        </Button>
        <Button onClick={handleContinue} className="flex-1">
          Continue
        </Button>
      </div>
    </div>
  );
};

