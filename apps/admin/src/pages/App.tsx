import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainApp } from '@/components/MainApp';
import { InviteCodeModal } from '@/components/InviteCodeModal';

const STORAGE_KEY = 'synth_invite_code';
const MASTER_INVITE_CODE = 'SYNTH2025';

const App = () => {
  console.log('📱 App component is rendering...');
  const navigate = useNavigate();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    // Check if user has valid invite code
    const storedCode = localStorage.getItem(STORAGE_KEY);
    
    if (storedCode === MASTER_INVITE_CODE) {
      setHasAccess(true);
    } else {
      // Show invite modal if no valid code
      setShowInviteModal(true);
    }
  }, []);

  const handleInviteSuccess = () => {
    setHasAccess(true);
    setShowInviteModal(false);
  };

  const handleInviteClose = () => {
    // If user closes without valid code, redirect to preview
    navigate('/preview');
  };

  if (!hasAccess) {
    return (
      <InviteCodeModal
        isOpen={showInviteModal}
        onClose={handleInviteClose}
        onSuccess={handleInviteSuccess}
      />
    );
  }

  return <MainApp />;
};

export default App;
