// src/routes/dataRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const Logger = require(path.resolve(__dirname,'../utils/Logger'));

const logger = Logger.getInstance();

// Get planning system data
router.get('/system', (req, res) => {
  try {
    if (req.session && req.session.planningSystem) {
      res.json({
        success: true,
        data: req.session.planningSystem
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No planning system data found'
      });
    }
  } catch (error) {
    logger.error('Error retrieving system data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system data'
    });
  }
});

// Get system summary
router.get('/summary', (req, res) => {
  try {
    if (req.session && req.session.planningSystem) {
      const data = req.session.planningSystem;
      res.json({
        success: true,
        summary: {
          products: Object.keys(data.products || {}).length,
          salesOrders: Object.keys(data.salesOrders || {}).length,
          lineRestrictions: Object.keys(data.lineRestrictions || {}).length,
          operations: Object.keys(data.operations || {}).length,
          planningStartDate: data.planningStartDate,
          minEarlyDeliveryDays: data.minEarlyDeliveryDays,
          currentWeekIndex: data.currentWeekIndex,
          totalWeeks: (data.weeks || []).length
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No planning system data found'
      });
    }
  } catch (error) {
    logger.error('Error retrieving system summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system summary'
    });
  }
});

// Clear system data
router.delete('/system', (req, res) => {
  try {
    if (req.session) {
      delete req.session.planningSystem;
    }
    
    res.json({
      success: true,
      message: 'Planning system data cleared'
    });
  } catch (error) {
    logger.error('Error clearing system data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear system data'
    });
  }
});

module.exports = router;