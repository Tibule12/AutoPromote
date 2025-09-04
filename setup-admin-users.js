const { auth, db } = require('./firebaseAdmin');

async function setupAdminUserInFirestore() {
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
                
                // Set admin claims
                await auth.setCustomUserClaims(userRecord.uid, { 
                    admin: true,
                    role: 'admin'
                });
                console.log(`Updated admin claims for ${email}`);
                
                // Check if user exists in Firestore
                const userDoc = await db.collection('users').doc(userRecord.uid).get();
                
                if (!userDoc.exists) {
                    // Create user document in Firestore
                    await db.collection('users').doc(userRecord.uid).set({
                        email: email,
                        name: userRecord.displayName || 'Administrator',
                        role: 'admin',
                        isAdmin: true,
                        createdAt: new Date(),
                        lastUpdated: new Date()
                    });
                    console.log(`Created Firestore document for ${email}`);
                } else {
                    // Update existing document
                    await db.collection('users').doc(userRecord.uid).update({
                        role: 'admin',
                        isAdmin: true,
                        lastUpdated: new Date()
                    });
                    console.log(`Updated Firestore document for ${email}`);
                }
                
                console.log(`Successfully set up admin user: ${email}`);
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    console.log(`User not found: ${email}. Skipping.`);
                } else {
                    console.error(`Error processing user ${email}:`, error);
                }
            }
        }
        
        console.log('Admin setup completed.');
    } catch (error) {
        console.error('Error in setup process:', error);
    }
}

setupAdminUserInFirestore().then(() => process.exit());
