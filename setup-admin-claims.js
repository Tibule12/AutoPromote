const { auth, admin } = require('./firebaseAdmin');

async function setupAdminUsersWithClaims() {
    try {
        // Array of admin emails to check and set up
        const adminEmails = [
            'admin123@gmail.com', 
            'newadmin@example.com',
            'admin_backup@example.com',
            'admin@autopromote.com'
        ];
        
        for (const email of adminEmails) {
            try {
                // Get the user record
                const userRecord = await auth.getUserByEmail(email);
                console.log(`Found user: ${email} with ID: ${userRecord.uid}`);
                
                // Set custom claims for the user
                await auth.setCustomUserClaims(userRecord.uid, { 
                    admin: true,
                    role: 'admin'
                });
                console.log(`Successfully updated admin claims for ${email}`);
                
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    console.log(`User not found: ${email}. Skipping.`);
                } else {
                    console.error(`Error processing user ${email}:`, error);
                }
            }
        }
        
        console.log('Admin claims setup completed.');
    } catch (error) {
        console.error('Error in setup process:', error);
    }
}

setupAdminUsersWithClaims().then(() => process.exit());
