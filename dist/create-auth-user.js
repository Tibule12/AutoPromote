const { auth, db } = require('./firebaseAdmin');

async function createAuthUser() {
    try {
        // Create the authentication user
        const userRecord = await auth.createUser({
            email: 'tmtshwelo21@gmail.com',
            password: 'Test123!', // You should change this password
            emailVerified: true
        });

        // Create the corresponding user document in Firestore
        await db.collection('users').doc(userRecord.uid).set({
            id: userRecord.uid,
            name: 'Tulani Mtshwelo',
            email: 'tmtshwelo21@gmail.com',
            role: 'admin', // Setting as admin since this is your account
            createdAt: new Date().toISOString()
        });

        console.log('Successfully created auth user and Firestore document:', userRecord.uid);
    } catch (error) {
        if (error.code === 'auth/email-already-exists') {
            console.log('User already exists. Setting up Firestore document...');
            
            // Get the existing user
            const userRecord = await auth.getUserByEmail('tmtshwelo21@gmail.com');
            
            // Create/Update the Firestore document
            await db.collection('users').doc(userRecord.uid).set({
                id: userRecord.uid,
                name: 'Tulani Mtshwelo',
                email: 'tmtshwelo21@gmail.com',
                role: 'admin',
                createdAt: new Date().toISOString()
            });
            
            console.log('Updated Firestore document for existing user:', userRecord.uid);
        } else {
            console.error('Error creating user:', error);
        }
    }
}

createAuthUser();
