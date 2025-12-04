// Email integration examples for AutoPromote
// Add these to your existing route handlers

const { 
  sendWelcomeEmail, 
  sendPasswordResetEmail,
  sendPayoutNotification,
  sendContentPublishedNotification,
  sendSecurityAlert,
  sendScheduleReminder
} = require('./services/emailService');

// Example 1: Send welcome email after user registration
async function onUserRegistration(user) {
  try {
    await sendWelcomeEmail({
      email: user.email,
      name: user.name,
      loginUrl: 'https://autopromote.org/dashboard'
    });
    console.log('Welcome email sent to:', user.email);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    // Don't block registration if email fails
  }
}

// Example 2: Send password reset email
async function onPasswordResetRequest(user, resetToken) {
  try {
    const resetUrl = `https://autopromote.org/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail({
      email: user.email,
      link: resetUrl
    });
    console.log('Password reset email sent to:', user.email);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error; // This should block the reset if email fails
  }
}

// Example 3: Send payout notification
async function onPayoutProcessed(user, payout) {
  try {
    await sendPayoutNotification({
      email: user.email,
      name: user.name,
      amount: payout.amount.toFixed(2),
      method: payout.method,
      expectedDate: payout.expectedDate
    });
    console.log('Payout notification sent to:', user.email);
  } catch (error) {
    console.error('Failed to send payout notification:', error);
  }
}

// Example 4: Send content published notification
async function onContentPublished(user, content) {
  try {
    await sendContentPublishedNotification({
      email: user.email,
      name: user.name,
      contentTitle: content.title,
      platforms: content.platforms
    });
    console.log('Content published notification sent to:', user.email);
  } catch (error) {
    console.error('Failed to send content notification:', error);
  }
}

// Example 5: Send security alert on suspicious login
async function onSuspiciousLogin(user, loginInfo) {
  try {
    await sendSecurityAlert({
      email: user.email,
      name: user.name,
      action: 'Login',
      device: loginInfo.device,
      location: loginInfo.location,
      timestamp: new Date().toLocaleString()
    });
    console.log('Security alert sent to:', user.email);
  } catch (error) {
    console.error('Failed to send security alert:', error);
  }
}

// Example 6: Send schedule reminder
async function onScheduleReminder(user, schedule) {
  try {
    await sendScheduleReminder({
      email: user.email,
      name: user.name,
      contentTitle: schedule.contentTitle,
      scheduledTime: new Date(schedule.scheduledTime).toLocaleString(),
      platforms: schedule.platforms
    });
    console.log('Schedule reminder sent to:', user.email);
  } catch (error) {
    console.error('Failed to send schedule reminder:', error);
  }
}

module.exports = {
  onUserRegistration,
  onPasswordResetRequest,
  onPayoutProcessed,
  onContentPublished,
  onSuspiciousLogin,
  onScheduleReminder
};
