// Environment variable checker
console.log('Environment check on startup:');
console.log('API Key available:', !!process.env.REACT_APP_FIREBASE_API_KEY);
console.log('API Key fallback used:', !process.env.REACT_APP_FIREBASE_API_KEY && 'Fallback being used');
console.log('API URL:', process.env.REACT_APP_API_URL || 'http://localhost:5001');

export const checkEnv = () => {
  return {
    apiKeyAvailable: !!process.env.REACT_APP_FIREBASE_API_KEY,
    apiKeyValue: process.env.REACT_APP_FIREBASE_API_KEY || 'Using fallback',
    apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:5001'
  };
};
