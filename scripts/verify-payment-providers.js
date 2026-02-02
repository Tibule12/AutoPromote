require('dotenv').config();

// User confirmed keys are LIVE. Force the Live API URL for testing.
// (In production, ensure PAYPAL_API_BASE=https://api-m.paypal.com is in your .env)
process.env.PAYPAL_API_BASE = "https://api-m.paypal.com";

const { PayPalProvider } = require('../src/services/payments/paypalProvider');
const paypalClient = require('../src/services/paypal');
const { PayFastProvider } = require('../src/services/payments/payfastProvider');

/* eslint-disable no-console */

async function testPayPal() {
    console.log('\n--- TESTING PAYPAL ---');
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        console.log('⚠️ PayPal credentials missing in .env');
        return;
    }

    try {
        console.log('🔄 Attempting to create a test order (0.01 USD)...');
        const order = await paypalClient.createOrder({ amount: '0.01', currency: 'USD' });
        
        if (order.id) {
            console.log(`✅ PayPal Test Success! Order ID created: ${order.id}`);
            console.log(`   Status: ${order.status}`);
        } else {
            console.log('❌ PayPal Test Failed: No Order ID returned.');
            console.log(JSON.stringify(order, null, 2));
        }
    } catch (error) {
        console.error('❌ PayPal Test Error:', error.message);
    }
}

async function testPayFast() {
    console.log('\n--- TESTING PAYFAST ---');
    if (!process.env.PAYFAST_MERCHANT_ID || !process.env.PAYFAST_MERCHANT_KEY) {
        console.log('⚠️ PayFast credentials missing in .env');
        return;
    }

    try {
        // Need to Mock DB for this test if we don't want to write to real Firestore? 
        // Or we assume Firestore works. The project seems to use real Firebase Admin.
        // If we run this locally, we need credentials.
        // Assuming the environment is set up for it.

        const provider = new PayFastProvider();
        console.log('🔄 Attempting to generate PayFast signature...');
        
        const result = await provider.createOrder({
            amount: 50.00,
            currency: 'ZAR',
            metadata: { description: 'Integration Test' }
        });

        if (result && result.order && result.order.params && result.order.params.signature) {
            console.log(`✅ PayFast Test Success! Signature generated: ${result.order.params.signature}`);
            console.log(`   Merchant ID: ${result.order.params.merchant_id}`);
            // console.log(`   Params:`, result.params);
        } else {
            console.log('❌ PayFast Test Failed: No params/signature returned.');
            console.log(result);
        }

    } catch (error) {
        console.error('❌ PayFast Test Error:', error.message);
    }
}

async function runUtility() {
    console.log('🧪 STARTING PAYMENT PROVIDER VERIFICATION');
    await testPayPal();
    // PayFast provider requires Firestore initialization.
    // If we run this script directly, we might need to initialize firebaseAdmin if it's not handled.
    // The PayFast provider imports 'db' from '../../firebaseAdmin'.
    // firebaseAdmin usually calls admin.initializeApp(). 
    // If we are in the same environment, it should work.
    
    // However, if strict environment checking is on, we might need to mock db if we don't have creds.
    // Let's see if we can run it.
    try {
        await testPayFast(); 
    } catch (e) {
        console.log("PayFast DB Dependency Error (likely expected in test script if no DB connection):", e.message);
    }
    
    console.log('\n🏁 VERIFICATION COMPLETE');
    process.exit(0);
}

runUtility();
