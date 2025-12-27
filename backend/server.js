// Load environment variables from .env.local (in root directory)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

// Set Supabase defaults BEFORE requiring routes (so they can use process.env)
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'https://glpiolbrafqikqhnseto.supabase.co';
}
if (!process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc4MjQsImV4cCI6MjA3MjUxMzgyNH0.O5G3fW-YFtpACNqNfo_lsLK44F-3L3p69Ka-G2lSTLE';
}

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

// JamBase API - Optional, uses default if not set
if (!process.env.JAMBASE_API_KEY) {
  process.env.JAMBASE_API_KEY = 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
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
  'http://localhost:8080',
  'https://synth-beta-testing.vercel.app',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log for debugging but allow in development
      if (NODE_ENV === 'development') {
        console.warn(`⚠️  CORS warning: ${origin} not in allowed list, but allowing in development`);
        return callback(null, true);
      }
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
if (ticketmasterRoutes && ticketmasterRoutes.stack) {
  ticketmasterRoutes.stack.forEach((route) => {
    if (route.route) {
      console.log(`${Object.keys(route.route.methods).join(', ').toUpperCase()} ${route.route.path}`);
    }
  });
}

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