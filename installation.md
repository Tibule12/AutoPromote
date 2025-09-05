# Installation Guide

## Prerequisites
- Node.js (v14 or later)
- npm (v6 or later)
- Firebase account
- Git

## Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/AutoPromote.git
cd AutoPromote
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory with the following variables (see `.env.example` for reference):

```
PORT=3000
NODE_ENV=development
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_auth_domain
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id
FIREBASE_ADMIN_TYPE=service_account
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_ADMIN_PRIVATE_KEY=your_private_key
FIREBASE_ADMIN_CLIENT_EMAIL=your_client_email
FIREBASE_ADMIN_CLIENT_ID=your_client_id
FIREBASE_ADMIN_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_ADMIN_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_ADMIN_CLIENT_X509_CERT_URL=your_cert_url
```

### 4. Firebase Setup
1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication and Firestore in your project
3. Generate a Firebase Admin SDK private key from Project Settings > Service Accounts
4. Use the generated key to fill in the FIREBASE_ADMIN_* variables in your .env file

### 5. Start Development Server
```bash
npm run dev
```

## Testing
Run tests with:
```bash
npm test
```

## Deployment
### Deploying to Render
1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set the build command to `npm install`
4. Set the start command to `npm start`
5. Add all environment variables from your .env file
6. Deploy!

### GitHub Pages Setup
The documentation is hosted on GitHub Pages. To update it:
1. Make changes to files in the `docs` directory
2. Commit and push to the main branch
3. GitHub Actions will automatically deploy the updated documentation
