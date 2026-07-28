import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  console.log('📄 Index component is rendering...');
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to /home when accessing the root path
    navigate('/home', { replace: true });
  }, [navigate]);

  return null; // Don't render anything while redirecting
};

export default Index;
