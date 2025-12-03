require('dotenv').config();
const { 
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPayoutNotification,
  sendContentPublishedNotification,
  sendSecurityAlert 
} = require('./src/services/emailService');

async function main() {
  console.log('=== AutoPromote Email Service Test ===\n');

  const testEmail = process.env.TEST_EMAIL || 'test@example.com';
  const emailProvider = process.env.EMAIL_PROVIDER || 'console';
  
  console.log(`Provider: ${emailProvider}`);
  console.log(`Test Email: ${testEmail}\n`);

  // Test 1: Basic email
  try {
    console.log('1. Testing basic email...');
    const result = await sendEmail({
      to: testEmail,
      subject: 'AutoPromote Email Test',
      html: '<h1>Test Email</h1><p>If you receive this, email is configured correctly!</p>',
      text: 'Test Email - If you receive this, email is configured correctly!'
    });
    console.log('✅ Basic email sent:', result);
  } catch (error) {
    console.error('❌ Basic email failed:', error.message);
  }

  // Test 2: Welcome email
  try {
    console.log('\n2. Testing welcome email template...');
    const result = await sendWelcomeEmail({
      email: testEmail,
      name: 'Test User',
      loginUrl: 'https://autopromote.org/dashboard'
    });
    console.log('✅ Welcome email sent:', result);
  } catch (error) {
    console.error('❌ Welcome email failed:', error.message);
  }

  // Test 3: Password reset
  try {
    console.log('\n3. Testing password reset email...');
    const result = await sendPasswordResetEmail({
      email: testEmail,
      link: 'https://autopromote.org/reset?token=abc123def456'
    });
    console.log('✅ Password reset email sent:', result);
  } catch (error) {
    console.error('❌ Password reset email failed:', error.message);
  }

  // Test 4: Payout notification
  try {
    console.log('\n4. Testing payout notification...');
    const result = await sendPayoutNotification({
      email: testEmail,
      name: 'Test User',
      amount: '150.00',
      method: 'PayPal',
      expectedDate: 'December 10, 2025'
    });
    console.log('✅ Payout notification sent:', result);
  } catch (error) {
    console.error('❌ Payout notification failed:', error.message);
  }

  // Test 5: Content published
  try {
    console.log('\n5. Testing content published notification...');
    const result = await sendContentPublishedNotification({
      email: testEmail,
      name: 'Test User',
      contentTitle: 'My Awesome Video',
      platforms: ['TikTok', 'YouTube', 'Instagram']
    });
    console.log('✅ Content published notification sent:', result);
  } catch (error) {
    console.error('❌ Content published notification failed:', error.message);
  }

  // Test 6: Security alert
  try {
    console.log('\n6. Testing security alert...');
    const result = await sendSecurityAlert({
      email: testEmail,
      name: 'Test User',
      action: 'Login',
      device: 'Chrome on Windows',
      location: 'New York, USA',
      timestamp: new Date().toLocaleString()
    });
    console.log('✅ Security alert sent:', result);
  } catch (error) {
    console.error('❌ Security alert failed:', error.message);
  }

  console.log('\n=== Email Test Complete ===');
  console.log('\nNote: If using "console" provider, emails are logged but not actually sent.');
  console.log('To test real sending, set EMAIL_PROVIDER=resend, sendgrid, or mailtrap in .env');
  
  process.exit(0);
}

main();
