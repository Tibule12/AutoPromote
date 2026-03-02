
try {
  console.log('Attempting to require communityRoutes...');
  const communityRoutes = require('./src/routes/communityRoutes');
  console.log('Success! Exported type:', typeof communityRoutes);
} catch (error) {
  console.error('FATAL: Failed to require communityRoutes:', error);
}
