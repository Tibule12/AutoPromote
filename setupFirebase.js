// setupFirebase.js
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupFirebase() {
  console.log('======================================');
  console.log('Firebase Setup Assistant');
  console.log('======================================');
  console.log('\nThis script will help you set up Firebase for AutoPromote integration tests.');
  
  // Check for existing service account key
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    console.log('\nA service account key file already exists.');
    const answer = await askQuestion('Do you want to replace it? (y/n): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('Setup canceled. Using existing service account key.');
      rl.close();
      return;
    }
  }
  
  console.log('\nFollow these steps to get a new service account key:');
  console.log('1. Go to the Firebase Console (https://console.firebase.google.com/)');
  console.log('2. Select your project');
  console.log('3. Click the gear icon ⚙️ (Settings) > Project settings');
  console.log('4. Go to the "Service accounts" tab');
  console.log('5. Click "Generate new private key" button');
  console.log('6. Save the downloaded JSON file');
  
  const filePath = await askQuestion('\nEnter the path to the downloaded JSON file: ');
  
  try {
    // Read the service account key
    const serviceAccountData = fs.readFileSync(filePath, 'utf8');
    const serviceAccount = JSON.parse(serviceAccountData);
    
    // Check required fields
    const requiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !serviceAccount[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Service account key is missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Save to project directory
    fs.writeFileSync(serviceAccountPath, serviceAccountData);
    
    console.log(`\n✅ Service account key saved successfully!`);
    console.log(`Project ID: ${serviceAccount.project_id}`);
    console.log(`Client Email: ${serviceAccount.client_email}`);
    
    // Create a test-results directory if it doesn't exist
    const resultsDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir);
      console.log('\n✅ Created test-results directory');
    }
    
    console.log('\nNow you can run the connection test:');
    console.log('node checkDatabaseConnectionDebug.js');
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.log('Please try again with a valid service account key file.');
  } finally {
    rl.close();
  }
}

setupFirebase();
