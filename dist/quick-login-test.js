// quick-login-test.js
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-464de.firebaseapp.com",
  projectId: "autopromote-464de",
  storageBucket: "autopromote-464de.firebasestorage.app",
  messagingSenderId: "317746682241",
  appId: "1:317746682241:web:f363e099d55ffd1af1b080"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function tryLogin() {
  try {
    console.log('Attempting to log in...');
    
    // Try admin login
    try {
      console.log('\nTesting admin login:');
      const adminCredential = await signInWithEmailAndPassword(auth, 'admin123@gmail.com', 'Admin12345');
      console.log('✅ Admin login successful!');
      console.log('Admin:', adminCredential.user.email, adminCredential.user.uid);
    } catch (error) {
      console.log('❌ Admin login failed:', error.code);
      console.log('Error details:', error.message);
    }
    
    // Try user login
    try {
      console.log('\nTesting user login:');
      const userCredential = await signInWithEmailAndPassword(auth, 'test@example.com', 'Test123!');
      console.log('✅ User login successful!');
      console.log('User:', userCredential.user.email, userCredential.user.uid);
    } catch (error) {
      console.log('❌ User login failed:', error.code);
      console.log('Error details:', error.message);
    }
    
  } catch (error) {
    console.error('General error:', error);
  }
}

tryLogin();
