// Back-end entry point
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./db');

// Load env vars
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];

console.log('Debug: Checking environment variables in app.js');
requiredEnvVars.forEach(varName => {
  console.log(`  ${varName}: ${process.env[varName] ? 'SET' : 'MISSING'}`);
});

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('💡 Please check your .env file and ensure all required variables are set.');
  console.error('📋 You can use .env.example as a reference for the required variables.');
  console.error('🚫 Server cannot start without these variables.');
  process.exit(1);
}

// Validate JWT_SECRET strength (minimum 32 characters for security)
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET is too weak!');
  console.error('🔒 Please use a secret that is at least 32 characters long for better security.');
  console.error('💡 You can generate a strong secret using:');
  console.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('   or run: npm run generate-secret');
  process.exit(1);
}

// Connect to database (Supabase)
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS - allow multiple origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:3001'];

console.log(`🌐 Allowed CORS origins: ${allowedOrigins.join(', ')}`);
console.log(`🌐 ALLOWED_ORIGINS env var: ${process.env.ALLOWED_ORIGINS || 'Not set'}`);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    console.log(`🌐 CORS check for origin: ${origin}`);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log(`✅ CORS allowed for origin: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
app.use('/api/users', require('./userRoutes'));
app.use('/api/content', require('./contentRoutes'));
app.use('/api/analytics', require('./analyticsRoutes'));

app.get('/', (req, res) => {
  res.send('AutoPromote Server Running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
