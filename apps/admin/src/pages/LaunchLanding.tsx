import React, { useState } from 'react';
import { LaunchHeader } from '@/components/launch/LaunchHeader';
import { LaunchHero } from '@/components/launch/LaunchHero';
import { LaunchFeatures } from '@/components/launch/LaunchFeatures';
import { LaunchAppPreview } from '@/components/launch/LaunchAppPreview';
import { LaunchCTA } from '@/components/launch/LaunchCTA';
import { EmailSignupModal } from '@/components/launch/EmailSignupModal';

export const LaunchLanding = () => {
  const [showEmailModal, setShowEmailModal] = useState(false);

  const handleSignUpClick = () => {
    setShowEmailModal(true);
  };

  return (
    <main className="min-h-screen">
      <LaunchHeader />
      <LaunchHero onSignUpClick={handleSignUpClick} />
      <LaunchFeatures />
      <LaunchAppPreview />
      <LaunchCTA onSignUpClick={handleSignUpClick} />
      
      <EmailSignupModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
      />
    </main>
  );
};

export default LaunchLanding;
