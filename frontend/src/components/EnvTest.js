import React, { useEffect } from 'react';

const EnvTest = () => {
  useEffect(() => {
    // Use the correct API key directly
    console.log('Firebase API Key:', 'AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY');
    console.log('Firebase Auth Domain:', 'autopromote-464de.firebaseapp.com');
  }, []);

  return null;
};

export default EnvTest;
