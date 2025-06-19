// src/routes/optimizationRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const Logger = require(path.resolve(__dirname,'../utils/Logger'));

const logger = Logger.getInstance();

// Get optimization status
router.get('/status', (req, res) => {
  try {
    // In a real implementation, you would track optimization jobs
    // For now, return a simple status
    res.json({
      success: true,
      status: 'idle',
      message: 'No active optimization jobs'
    });
  } catch (error) {
    logger.error('Error getting optimization status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get optimization status'
    });
  }
});

// Cancel optimization (placeholder)
router.post('/cancel', (req, res) => {
  try {
    // In a real implementation, you would cancel running optimization
    res.json({
      success: true,
      message: 'Optimization cancellation requested'
    });
  } catch (error) {
    logger.error('Error cancelling optimization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel optimization'
    });
  }
});

// Get optimization parameters
router.get('/parameters', (req, res) => {
  try {
    res.json({
      success: true,
      parameters: {
        populationSize: { default: 100, min: 20, max: 500 },
        generations: { default: 50, min: 10, max: 200 },
        mutationRate: { default: 0.1, min: 0.01, max: 0.5 },
        crossoverRate: { default: 0.8, min: 0.1, max: 1.0 },
        minEarlyDeliveryDays: { default: 7, min: 0, max: 30 }
      }
    });
  } catch (error) {
    logger.error('Error getting optimization parameters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get optimization parameters'
    });
  }
});

module.exports = router;