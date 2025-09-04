@echo off
echo ================================================
echo   Firebase Database Connectivity Test
echo ================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed. Please install Node.js to run this test.
    exit /b 1
)

REM Create temporary test script
echo Creating temporary test script...
echo // Firebase Connectivity Test > firebase-test.js
echo const { initializeApp } = require('firebase/app'); >> firebase-test.js
echo const { getAuth, signInAnonymously } = require('firebase/auth'); >> firebase-test.js
echo const { getFirestore, collection, getDocs, limit, query } = require('firebase/firestore'); >> firebase-test.js
echo const { getStorage, ref, listAll } = require('firebase/storage'); >> firebase-test.js
echo. >> firebase-test.js
echo // Firebase configuration >> firebase-test.js
echo const firebaseConfig = { >> firebase-test.js
echo   apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY", >> firebase-test.js
echo   authDomain: "autopromote-464de.firebaseapp.com", >> firebase-test.js
echo   projectId: "autopromote-464de", >> firebase-test.js
echo   storageBucket: "autopromote-464de.appspot.com", >> firebase-test.js
echo   messagingSenderId: "317746682241", >> firebase-test.js
echo   appId: "1:317746682241:web:f363e099d55ffd1af1b080", >> firebase-test.js
echo   measurementId: "G-8QDQXF0FPQ" >> firebase-test.js
echo }; >> firebase-test.js
echo. >> firebase-test.js
echo // Initialize Firebase >> firebase-test.js
echo console.log('Initializing Firebase...'); >> firebase-test.js
echo const app = initializeApp(firebaseConfig); >> firebase-test.js
echo const auth = getAuth(app); >> firebase-test.js
echo const db = getFirestore(app); >> firebase-test.js
echo const storage = getStorage(app); >> firebase-test.js
echo. >> firebase-test.js
echo // Run tests >> firebase-test.js
echo async function runTests() { >> firebase-test.js
echo   console.log('=== FIREBASE CONNECTIVITY TEST ==='); >> firebase-test.js
echo   console.log('Starting tests at ' + new Date().toISOString()); >> firebase-test.js
echo   console.log(); >> firebase-test.js
echo. >> firebase-test.js
echo   // Test Authentication >> firebase-test.js
echo   console.log('1. Testing Authentication...'); >> firebase-test.js
echo   try { >> firebase-test.js
echo     const anonAuth = await signInAnonymously(auth); >> firebase-test.js
echo     console.log('   ✓ Authentication successful!'); >> firebase-test.js
echo     console.log('   User ID: ' + anonAuth.user.uid); >> firebase-test.js
echo   } catch (error) { >> firebase-test.js
echo     console.log('   ✗ Authentication failed: ' + error.message); >> firebase-test.js
echo     console.log('   Error code: ' + error.code); >> firebase-test.js
echo   } >> firebase-test.js
echo   console.log(); >> firebase-test.js
echo. >> firebase-test.js
echo   // Test Firestore >> firebase-test.js
echo   console.log('2. Testing Firestore...'); >> firebase-test.js
echo   try { >> firebase-test.js
echo     const usersQuery = query(collection(db, 'users'), limit(1)); >> firebase-test.js
echo     const usersSnapshot = await getDocs(usersQuery); >> firebase-test.js
echo     console.log('   ✓ Firestore connection successful!'); >> firebase-test.js
echo     console.log('   Found ' + usersSnapshot.size + ' users'); >> firebase-test.js
echo. >> firebase-test.js
echo     // Test more collections >> firebase-test.js
echo     const collections = ['users', 'content', 'promotions', 'analytics']; >> firebase-test.js
echo     for (const collName of collections) { >> firebase-test.js
echo       try { >> firebase-test.js
echo         const q = query(collection(db, collName), limit(1)); >> firebase-test.js
echo         const snap = await getDocs(q); >> firebase-test.js
echo         console.log('   - Collection \'' + collName + '\': ' + (snap.empty ? 'Empty' : 'Contains data')); >> firebase-test.js
echo       } catch (e) { >> firebase-test.js
echo         console.log('   - Collection \'' + collName + '\': Error - ' + e.message); >> firebase-test.js
echo       } >> firebase-test.js
echo     } >> firebase-test.js
echo   } catch (error) { >> firebase-test.js
echo     console.log('   ✗ Firestore connection failed: ' + error.message); >> firebase-test.js
echo     console.log('   Error code: ' + error.code); >> firebase-test.js
echo   } >> firebase-test.js
echo   console.log(); >> firebase-test.js
echo. >> firebase-test.js
echo   // Test Storage >> firebase-test.js
echo   console.log('3. Testing Storage...'); >> firebase-test.js
echo   try { >> firebase-test.js
echo     const storageRef = ref(storage); >> firebase-test.js
echo     const result = await listAll(storageRef); >> firebase-test.js
echo     console.log('   ✓ Storage connection successful!'); >> firebase-test.js
echo     console.log('   Found ' + result.items.length + ' files and ' + result.prefixes.length + ' folders'); >> firebase-test.js
echo   } catch (error) { >> firebase-test.js
echo     console.log('   ✗ Storage connection failed: ' + error.message); >> firebase-test.js
echo     console.log('   Error code: ' + error.code); >> firebase-test.js
echo   } >> firebase-test.js
echo   console.log(); >> firebase-test.js
echo. >> firebase-test.js
echo   console.log('Test completed at ' + new Date().toISOString()); >> firebase-test.js
echo   console.log('=== END OF TEST ==='); >> firebase-test.js
echo } >> firebase-test.js
echo. >> firebase-test.js
echo runTests(); >> firebase-test.js

echo Installing required packages...
call npm install firebase --no-save

echo.
echo Running Firebase connectivity test...
echo.
node firebase-test.js

echo.
echo Cleaning up...
del firebase-test.js

echo.
echo Test completed!
echo.
echo ================================================
echo.
pause
