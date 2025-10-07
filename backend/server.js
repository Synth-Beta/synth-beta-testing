const express = require('express');
const cors = require('cors');
const searchRoutes = require('./search-routes');
const searchConcertsRoutes = require('./search-concerts');
const streamingProfileRoutes = require('./streaming-profile-routes');
const locationSearchRoutes = require('./location-search-routes');

const app = express();

// Server Configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Supabase Configuration - Set defaults if not provided
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'https://glpiolbrafqikqhnseto.supabase.co';
}
if (!process.env.SUPABASE_ANON_KEY) {
  // Use the SERVICE ROLE key for backend operations (has full database access)
  process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
}

// JamBase API
process.env.JAMBASE_API_KEY = process.env.JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';

// Middleware
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', searchRoutes);
app.use('/', searchConcertsRoutes);
app.use('/', streamingProfileRoutes);
app.use('/', locationSearchRoutes);

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