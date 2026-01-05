// Load environment variables from .env.local (in root directory)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

// Validate API keys on startup
const { validateApiKeys } = require('./config/apiKeys');
const NODE_ENV = process.env.NODE_ENV || 'development';

// In production, require all keys. In development, allow missing keys with warnings
try {
  validateApiKeys(NODE_ENV !== 'production');
} catch (error) {
  console.error('❌ API key validation failed:', error.message);
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
  console.warn('⚠️  Continuing in development mode with missing keys');
}

const express = require('express');
const cors = require('cors');
const searchRoutes = require('./search-routes');
const searchConcertsRoutes = require('./search-concerts');
const streamingProfileRoutes = require('./streaming-profile-routes');
const locationSearchRoutes = require('./location-search-routes');
const setlistRoutes = require('./setlist-routes');
const ticketmasterRoutes = require('./ticketmaster-routes');
const authRoutes = require('./auth-routes');

const app = express();

// Server Configuration
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Middleware
const allowedOrigins = [
  FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:8080',
  'https://synth-beta-testing.vercel.app',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost'
];

// CORS Configuration - Security hardening
app.use(cors({
  origin: (origin, callback) => {
    // In production, be strict about origins
    if (NODE_ENV === 'production') {
      // Reject requests with no origin in production (security best practice)
      if (!origin) {
        return callback(new Error('CORS: Origin header is required in production'));
      }
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Reject unknown origins in production
      console.warn(`⚠️  CORS: Rejected request from origin: ${origin}`);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    }
    
    // In development, be more permissive
    if (!origin) {
      // Allow requests with no origin in development (for mobile apps, Postman, etc.)
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS warning: ${origin} not in allowed list, but allowing in development`);
      return callback(null, true);
    }
  },
  credentials: true
}));

// Request size limits to prevent DoS attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Routes
app.use('/', searchRoutes);
app.use('/', searchConcertsRoutes);
app.use('/', streamingProfileRoutes);
app.use('/', locationSearchRoutes);
app.use('/', setlistRoutes);
app.use('/', ticketmasterRoutes);
app.use('/', authRoutes);

// Debug: Log all registered routes
console.log('Registered routes:');
searchRoutes.stack.forEach((route) => {
  if (route.route) {
    console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
  }
});
searchConcertsRoutes.stack.forEach((route) => {
  if (route.route) {
    console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
  }
});
streamingProfileRoutes.stack.forEach((route) => {
  if (route.route) {
    console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
  }
});
locationSearchRoutes.stack.forEach((route) => {
  if (route.route) {
    console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
  }
});
setlistRoutes.stack.forEach((route) => {
  if (route.route) {
    console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
  }
});
if (ticketmasterRoutes && ticketmasterRoutes.stack) {
ticketmasterRoutes.stack.forEach((route) => {
  if (route.route) {
    console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
  }
});
}
authRoutes.stack.forEach((route) => {
  if (route.route) {
    console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
  }
});

// Health check endpoint with lenient rate limiting
const { createRateLimiter } = require('./middleware/rateLimiter');
app.get('/health', createRateLimiter('lenient'), (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    port: PORT
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${NODE_ENV}`);
  console.log(`🌐 CORS enabled for: ${FRONTEND_URL}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(`   Kill the process using: lsof -ti:${PORT} | xargs kill -9`);
    console.error(`   Or use a different port: PORT=3002 npm run backend:dev`);
    process.exit(1);
  } else {
    throw err;
  }
});

module.exports = app;
