const dotenv = require('dotenv');

console.log('Testing dotenv configuration...');
dotenv.config();

console.log('Environment variables:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '*** (set)' : 'undefined');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '*** (set)' : 'undefined');
console.log('PORT:', process.env.PORT);
console.log('ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS);
