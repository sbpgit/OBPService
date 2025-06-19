const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const xsenv = require('@sap/xsenv');
const cds = require("@sap/cds");
const session = require('express-session');
// Load environment
try {
  xsenv.loadEnv();
} catch (error) {
  console.warn('xsenv loadEnv failed:', error.message);
}

// Import modules with error handling
let OrderPlanningSystem, GeneticAlgorithmOptimizer, ResultsAnalyzer, ExcelHandler, Logger;

try {
  const path = require('path');
  OrderPlanningSystem = require(path.resolve(__dirname,'core/OrderPlanningSystem'));
  GeneticAlgorithmOptimizer = require(path.resolve(__dirname,'optimization/GeneticAlgorithmOptimizer'));
  ResultsAnalyzer = require(path.resolve(__dirname,'analysis/ResultsAnalyzer'));
  ExcelHandler = require(path.resolve(__dirname,'utils/ExcelHandler'));
  Logger = require(path.resolve(__dirname,'utils/Logger'));
} catch (error) {
  console.error('Module import error:', error.message);
  // Create a basic logger if Logger module fails
  Logger = {
    getInstance: () => ({
      info: console.log,
      error: console.error,
      warn: console.warn
    })
  };
}

const app = express();
const PORT = process.env.PORT || 3030;

// Logger setup with fallback
let logger;
try {
  logger = Logger.getInstance();
} catch (error) {
  logger = {
    info: console.log,
    error: console.error,
    warn: console.warn
  };
}

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(session({
  secret: 'order-planning-secret',   // 🔐 Change to a secure secret for production
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false                     // Set true only if HTTPS is used
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// File upload configuration
const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

// Static files with error handling
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use('/static', express.static(publicPath));
} else {
  logger.warn('Public directory not found:', publicPath);
}

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    logger.error('Health check error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Health check failed' });
    }
  }
});

// API Routes with error handling
try {
  const planningRoutes = require('./routes/planningRoutes');
  app.use('/api/planning', planningRoutes);
} catch (error) {
  logger.error('Failed to load planning routes:', error.message);
  app.use('/api/planning', (req, res) => {
    res.status(503).json({ error: 'Planning service unavailable' });
  });
}

try {
  const dataRoutes = require('./routes/dataRoutes');
  app.use('/api/data', dataRoutes);
} catch (error) {
  logger.error('Failed to load data routes:', error.message);
  app.use('/api/data', (req, res) => {
    res.status(503).json({ error: 'Data service unavailable' });
  });
}

try {
  const optimizationRoutes = require('./routes/optimizationRoutes');
  app.use('/api/optimization', optimizationRoutes);
} catch (error) {
  logger.error('Failed to load optimization routes:', error.message);
  app.use('/api/optimization', (req, res) => {
    res.status(503).json({ error: 'Optimization service unavailable' });
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Application Error:', error);
  
  // Check if response was already sent
  if (res.headersSent) {
    return next(error);
  }
  
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'File upload error',
      message: error.message
    });
  }
  
  // Handle different error types
  let statusCode = 500;
  let message = 'Internal server error';
  
  if (error.status) {
    statusCode = error.status;
  }
  
  if (process.env.NODE_ENV === 'development') {
    message = error.message;
  }
  
  res.status(statusCode).json({
    error: 'Internal server error',
    message: message
  });
});

// 404 handler
app.use('*', (req, res) => {
  if (!res.headersSent) {
    res.status(404).json({
      error: 'Route not found',
      path: req.originalUrl
    });
  }
});


// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
app.listen(PORT, () => {
  logger.info(`Order Planning System started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// module.exports = app;
// module.exports = server