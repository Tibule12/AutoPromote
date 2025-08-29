const dotenv = require('dotenv');

console.log('Testing environment variable validation...');
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

console.log('Required variables check:');
requiredEnvVars.forEach(varName => {
  console.log(`  ${varName}: ${process.env[varName] ? '✓ SET' : '✗ MISSING'}`);
});

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  process.exit(1);
} else {
  console.log('✅ All required environment variables are set!');
}
