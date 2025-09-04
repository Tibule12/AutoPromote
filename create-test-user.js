const { auth } = require('./firebaseAdmin');

async function createTestUser() {
    try {
        const userEmail = 'test@example.com';
        const userPassword = 'Test123!';

        const userRecord = await auth.createUser({
            email: userEmail,
            password: userPassword,
            emailVerified: true
        });

        console.log('✅ Test user created successfully:', userRecord.uid);
        console.log('Email:', userEmail);
        console.log('Password:', userPassword);
    } catch (error) {
        if (error.code === 'auth/email-already-exists') {
            console.log('✅ Test user already exists');
            console.log('Email: test@example.com');
            console.log('Password: Test123!');
        } else {
            console.error('❌ Error creating test user:', error);
        }
    }
}

createTestUser();
