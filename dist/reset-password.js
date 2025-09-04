const { auth } = require('./firebaseAdmin');

async function resetUserPassword() {
    const email = 'tmtshwelo21@gmail.com';
    const newPassword = 'Welcome123!'; // This will be your new password

    try {
        // Get user by email
        const userRecord = await auth.getUserByEmail(email);
        
        // Update password
        await auth.updateUser(userRecord.uid, {
            password: newPassword,
            emailVerified: true
        });

        console.log('Successfully updated user password');
        console.log('Email:', email);
        console.log('New password:', newPassword);
        console.log('Please use these credentials to log in');
    } catch (error) {
        console.error('Error updating password:', error);
    }
}

resetUserPassword();
