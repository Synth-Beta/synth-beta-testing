const express = require('express');
const router = express.Router();

// Ticketmaster routes - stub implementation
// This file exists to prevent server startup errors
// If Ticketmaster API functionality is needed, implement routes here

/**
 * Health check endpoint for ticketmaster service
 */
router.get('/api/ticketmaster/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ticketmaster-proxy',
    message: 'Ticketmaster routes are not yet implemented',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

