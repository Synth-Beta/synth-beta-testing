import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  console.log('📄 Index component is rendering...');
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to /app when accessing the root path
    navigate('/app', { replace: true });
  }, [navigate]);

  return null; // Don't render anything while redirecting
};

export default Index;
