// EnvChecker.js
import React, { useEffect } from 'react';
import { API_BASE_URL } from '../config';

const EnvChecker = () => {
  useEffect(() => {
    console.log('Environment Variables Check:');
    
    // Fixed API URL logging
  const apiUrl = process.env.REACT_APP_API_URL || 'https://www.autopromote.org';
    console.log('REACT_APP_API_URL:', apiUrl);
    console.log('Using URL:', apiUrl);

    // Check if we can connect to the backend
    const checkBackend = async () => {
      try {
        console.log('Trying to connect to backend at:', API_BASE_URL);

        const response = await fetch(`${API_BASE_URL}/api/health`);
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
  
  return null; // Hide this component since it's only for diagnostic purposes
};

export default EnvChecker;
