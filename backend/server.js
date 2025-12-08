const express = require('express');
const cors = require('cors');
const searchRoutes = require('./search-routes');
const searchConcertsRoutes = require('./search-concerts');
const streamingProfileRoutes = require('./streaming-profile-routes');
const locationSearchRoutes = require('./location-search-routes');
const setlistRoutes = require('./setlist-routes');
const ticketmasterRoutes = require('./ticketmaster-routes');

const app = express();

// Server Configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Supabase Configuration - Required environment variables
if (!process.env.SUPABASE_URL) {
  console.error('❌ ERROR: SUPABASE_URL environment variable is not set!');
  console.error('   Please set SUPABASE_URL in your .env.local file or environment.');
  process.exit(1);
}
if (!process.env.SUPABASE_ANON_KEY) {
  console.error('❌ ERROR: SUPABASE_ANON_KEY environment variable is not set!');
  console.error('   Please set SUPABASE_ANON_KEY in your .env.local file or environment.');
  process.exit(1);
}

// JamBase API - Required for event searches
if (!process.env.JAMBASE_API_KEY) {
  console.warn('⚠️  WARNING: JAMBASE_API_KEY environment variable is not set!');
  console.warn('   Some features may not work. Set JAMBASE_API_KEY in your .env.local file.');
}

// Middleware
const allowedOrigins = [
  FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:8080'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', searchRoutes);
app.use('/', searchConcertsRoutes);
app.use('/', streamingProfileRoutes);
app.use('/', locationSearchRoutes);
app.use('/', setlistRoutes);
app.use('/', ticketmasterRoutes);

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
ticketmasterRoutes.stack.forEach((route) => {
  if (route.route) {
    console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
  }
});

// Health check
app.get('/health', (req, res) => {
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
});

module.exports = app;