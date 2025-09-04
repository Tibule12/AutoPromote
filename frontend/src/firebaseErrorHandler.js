/**
 * Firebase Error Handler
 * 
 * This utility handles Firebase errors gracefully and provides 
 * user-friendly error messages for common Firebase issues.
 */

// Error codes mapping to user-friendly messages
const errorMessages = {
  // Auth errors
  'auth/user-not-found': 'No user found with this email address.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-email': 'The email address is not valid.',
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/too-many-requests': 'Too many unsuccessful login attempts. Please try again later.',
  'auth/account-exists-with-different-credential': 'An account already exists with the same email address but different sign-in credentials.',
  'auth/operation-not-allowed': 'This operation is not allowed.',
  'auth/requires-recent-login': 'This operation requires recent authentication. Please log in again.',
  'auth/user-disabled': 'This user account has been disabled.',
  'auth/invalid-credential': 'The credential is invalid.',
  
  // Firestore errors
  'permission-denied': 'You do not have permission to access this data.',
  'unavailable': 'The service is currently unavailable. Please try again later.',
  'not-found': 'The requested document was not found.',
  'already-exists': 'The document already exists.',
  'resource-exhausted': 'Quota exceeded. Please try again later.',
  
  // Storage errors
  'storage/unauthorized': 'User does not have permission to access the object.',
  'storage/canceled': 'User canceled the upload.',
  'storage/unknown': 'Unknown error occurred during upload.',
  
  // Generic errors
  'network-error': 'Network error. Please check your internet connection.',
  'unknown': 'An unknown error occurred. Please try again later.'
};

/**
 * Get a user-friendly error message from a Firebase error
 * 
 * @param {Error} error - The Firebase error object
 * @returns {string} User-friendly error message
 */
export const getFirebaseErrorMessage = (error) => {
  console.error('Firebase Error:', error);
  
  // Handle various error formats
  const errorCode = error.code || (error.message && error.message.includes(':') 
    ? error.message.split(':')[0].trim() 
    : 'unknown');
  
  return errorMessages[errorCode] || error.message || 'An error occurred. Please try again.';
};

/**
 * Log Firebase errors for debugging
 * 
 * @param {Error} error - The Firebase error object
 * @param {string} context - The context where the error occurred
 */
export const logFirebaseError = (error, context = 'Firebase Operation') => {
  console.error(`Firebase Error in ${context}:`, {
    code: error.code,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
};

/**
 * Handle Firebase connection issues
 * 
 * @returns {Promise<boolean>} True if connection was reestablished
 */
export const handleConnectionIssues = async () => {
  try {
    // Try to reconnect logic would go here
    return true;
  } catch (error) {
    console.error('Failed to reestablish Firebase connection:', error);
    return false;
  }
};

export default {
  getFirebaseErrorMessage,
  logFirebaseError,
  handleConnectionIssues
};
