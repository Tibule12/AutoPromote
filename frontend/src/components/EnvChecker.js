// EnvChecker.js
import React, { useEffect } from 'react';

const EnvChecker = () => {
  useEffect(() => {
    console.log('Environment Variables Check:');
    console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
    console.log('Using URL:', process.env.REACT_APP_API_URL || 'http://localhost:5000');

    // Check if we can connect to the backend
    const checkBackend = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        console.log('Trying to connect to backend at:', apiUrl);

        const response = await fetch(`${apiUrl}/api/health`);
        if (response.ok) {
          const data = await response.json();
          console.log('Backend connection successful:', data);
        } else {
          console.log('Backend returned error status:', response.status);
        }
      } catch (error) {
        console.error('Backend connection failed:', error.message);
      }
    };

    checkBackend();
  }, []);
  
  return (
    <div style={{ padding: '20px', background: '#f5f5f5', margin: '20px', borderRadius: '5px' }}>
      <h3>Environment Checker</h3>
      <p>Check the console for environment variable information</p>
    </div>
  );
};

export default EnvChecker;
