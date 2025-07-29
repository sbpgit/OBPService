// src/routes/planningRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const moment = require('moment');
const OrderPlanningSystem = require(path.resolve(__dirname, '../core/OrderPlanningSystem'));
const OrderPlanningSystemDaily = require(path.resolve(__dirname, '../core/OrderPlanningSystemDaily'));
const GeneticAlgorithmOptimizer = require(path.resolve(__dirname, '../optimization/GeneticAlgorithmOptimizer'));
const GeneticAlgorithmOptimizerDaily = require(path.resolve(__dirname, '../optimization/GeneticAlgorithmOptimizerDaily'));
const ResultsAnalyzer = require(path.resolve(__dirname, '../analysis/ResultsAnalyzer'));
const ResultsAnalyzerDaily = require(path.resolve(__dirname, '../analysis/ResultsAnalyzerDaily'));
const ExcelHandler = require(path.resolve(__dirname, '../utils/ExcelHandler'));
const Logger = require(path.resolve(__dirname, '../utils/Logger'));
const JobManager = require(path.resolve(__dirname, '../jobs/JobManager'));
const upload = multer({ dest: 'uploads/' });
const logger = Logger.getInstance();
// Generate sample data
router.post('/generate-sample', async (req, res) => {
  try {
    const { planningStartDate, minEarlyDeliveryDays } = req.body;

    const planningSystem = new OrderPlanningSystem(planningStartDate, minEarlyDeliveryDays);
    planningSystem.loadSampleData();


    const excelHandler = new ExcelHandler();
    const publicDir = path.join(__dirname, '..', 'public');
    const filePath = path.join(publicDir, 'sample_data.xlsx');
    await excelHandler.createSampleDataFile(planningSystem, filePath);
    res.setHeader('Content-Disposition', `attachment; filename="sample_data.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    console.log("Data created");
    // await excelHandler.streamExcelToResponse(res, data);
    console.log("Response");
    res.json({
      success: true,
      message: 'Sample data generated successfully',
      downloadUrl: '/static/sample_data.xlsx',
      summary: {
        products: planningSystem.products.size,
        salesOrders: planningSystem.salesOrders.size,
        lineRestrictions: planningSystem.lineRestrictions.size,
        planningStartDate: planningSystem.planningStartDate.format('YYYY-MM-DD'),
        minEarlyDeliveryDays: planningSystem.minEarlyDeliveryDays
      }
    });
    return res;

  } catch (error) {
    logger.error('Error generating sample data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate sample data',
      message: error.message
    });
  }
});


// Upload and process Excel file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { planningStartDate, minEarlyDeliveryDays = 7 } = req.body;

    logger.info(`Processing uploaded file: ${req.file.originalname}`);

    const excelHandler = new ExcelHandler();
    const data = await excelHandler.readExcelFile(req.file.path);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    // Create planning system from Excel data
    const planningSystem = await router.createPlanningSystemFromExcel(data, planningStartDate, minEarlyDeliveryDays);

    // Store in session or cache (simplified for this example)
    // req.session = req.session || {};
    console.log("Session at optimize:", req.session);
    req.session.planningSystem = planningSystem.toJSON();

    res.json({
      success: true,
      message: 'File processed successfully',
      summary: {
        planningSystem: planningSystem.toJSON(),
        products: planningSystem.products.size,
        salesOrders: planningSystem.salesOrders.size,
        lineRestrictions: planningSystem.lineRestrictions.size,
        planningStartDate: planningSystem.planningStartDate.format('YYYY-MM-DD'),
        minEarlyDeliveryDays: planningSystem.minEarlyDeliveryDays
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => { });
    }
     // Check if it's a capacity validation error
     if (error.message.includes('validation failed') || error.message.includes('zero or null capacity')) {
      return res.status(400).json({
        success: false,
        error: 'File validation failed - insufficient capacity data',
        message: error.message,
        suggestions: [
          'Check Weekly_Capacity sheet has positive values',
          'Verify Line_Restrictions have Avg_Weekly_Capacity > 0',
          'Ensure all capacity data is properly formatted'
        ]
      });
    }

    logger.error('Error processing uploaded file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process uploaded file',
      message: error.message
    });
  }
});

// Start async optimization
router.post('/optimize', async (req, res) => {
  const {
    planningSystem: planningSystemJSON,
    planningStartDate,
    minEarlyDeliveryDays = 7,
    populationSize = 100,
    generations = 50,
    mutationRate = 0.1,
    crossoverRate = 0.8
  } = req.body;
  let planningSystem = (planningSystemJSON && Object.keys(planningSystemJSON).length > 0)
    ? router.createPlanningSystemFromJSON(planningSystemJSON)
    : new OrderPlanningSystem(planningStartDate, minEarlyDeliveryDays);
  if (!planningSystemJSON) planningSystem.loadSampleData();


 // CRITICAL: Validate capacity before starting optimization
  const capacityValidation = planningSystem.validateCapacityForOptimization();
  
  if (!capacityValidation.isValid) {
    console.error('🚫 Optimization cannot proceed - Capacity validation failed');
    console.error('Critical Issues:', capacityValidation.criticalIssues);
    
    return res.status(400).json({
      success: false,
      error: 'Cannot start optimization - insufficient capacity data',
      details: {
        criticalIssues: capacityValidation.criticalIssues,
        issues: capacityValidation.issues,
        summary: {
          totalLines: capacityValidation.totalLines,
          zeroCapacityLines: capacityValidation.zeroCapacityLines,
          nullCapacityLines: capacityValidation.nullCapacityLines,
          hasAnyValidCapacity: capacityValidation.hasAnyValidCapacity
        }
      },
      message: 'Please check your capacity data. All line restrictions have zero or null capacity.',
      suggestions: [
        'Verify Weekly_Capacity sheet has positive values',
        'Check Line_Restrictions have Avg_Weekly_Capacity > 0',
        'Ensure capacity data is properly formatted (numbers, not text)'
      ]
    });
  }

  // Log capacity validation summary
  const summary = planningSystem.getCapacityValidationSummary();
  console.log('✅ Capacity Validation Passed:', summary.summary);
  if (summary.issues.length > 0) {
    console.warn('⚠️ Capacity Issues Found:', summary.issues);
  }


  const optimizer = new GeneticAlgorithmOptimizer(planningSystem, {
    populationSize, generations, mutationRate, crossoverRate,
    //New code added on 23/06/2025- Pradeep
    promiseDatePreference: req.body.promiseDatePreference || 0.7,
    timingVarianceWeeks: req.body.timingVarianceWeeks || 3,
    unnecessaryDelayPenalty: req.body.unnecessaryDelayPenalty || 100,
    perfectTimingBonus: req.body.perfectTimingBonus || 50
    //New code added on 23/06/2025- Pradeep
  });
  const jobId = JobManager.createJob(optimizer);
  console.time('📤 Sending Response');
  res.json({ success: true, jobId });
  res.end();
  console.timeEnd('📤 Sending Response');

  // ✅ Fire-and-forget background execution
  setImmediate(() => {
    (async () => {
      try {
        console.time('🧵 Background Optimization');
        const optimizationResult = await optimizer.optimize();
        const analyzer = new ResultsAnalyzer(planningSystem);
        const analysisResults = analyzer.analyzeSolution(optimizationResult.bestSolution);
        const comparisonReport = analyzer.generateComparisonReport(analysisResults);
        //New code added on 23/06/2025- Pradeep
        const timingMetrics = router.calculateTimingMetrics(analysisResults);
        //New code added on 23/06/2025- Pradeep
        const excelHandler = new ExcelHandler();
        const publicDir = path.join(__dirname, '..', 'public');
        const resultsFilePath = path.join(publicDir, 'optimization_results.xlsx');

        await excelHandler.createResultsFile(
          analysisResults,
          optimizationResult.bestSolution,
          optimizationResult.fitnessHistory,
          resultsFilePath
        );

        JobManager.setCompleted(jobId, {
          summary: comparisonReport.summary,
          performanceMetrics: comparisonReport.performanceMetrics,
          priorityBreakdown: comparisonReport.priorityBreakdown,
          priorityCompliance: comparisonReport.priorityCompliance, // New line added 23/06/2025 - Pradeep
          capacityUtilization: comparisonReport.capacityUtilization,
          //New code added on 23/06/2025- Pradeep
          timingMetrics: timingMetrics,
          //New code added on 23/06/2025- Pradeep
          finalFitness: optimizationResult.finalFitness,
          generations: optimizationResult.fitnessHistory.length,
          capacityViolations: router.analyzeCapacityViolations(analysisResults),// New line added 24/06/2025 based on version 3 ashok- Pradeep
          pivotTableInfo: {
            description: 'Capacity pivot table created',
            mainFile: '/static/optimization_results.xlsx',
            pivotFile: '/static/optimization_results_Capacity_Pivot.xlsx'
          }, // New line added 24/06/2025 based on version 3 ashok- Pradeep
          downloadUrl: '/static/optimization_results.xlsx',
          pivotDownloadUrl: '/static/optimization_results_Capacity_Pivot.xlsx' // New line added 24/06/2025 based on version 3 ashok- Pradeep
        });
      } catch (err) {
        if (err.message.includes('cancelled')) {
          console.log('🛑 Optimization was cancelled');
          JobManager.setError(jobId, 'Optimization was cancelled by user');
        } else {
          console.error('❌ Optimization failed:', err);
          JobManager.setError(jobId, err.message);
        }
        // JobManager.setError(jobId, err.message);
      }
      console.timeEnd('🧵 Background Optimization');

    })(); // ⬅️ Do NOT `await` this!
  });

});


// Polling status
router.get('/optimize/status/:jobId', (req, res) => {
  const job = JobManager.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

  res.json({
    success: true,
    status: job.status,
    result: job.status === 'completed' ? job.result : null,
    error: job.status === 'error' ? job.error : null
  });
});

// Cancel job
router.post('/optimize/stop', (req, res) => {

  const { fullJobId } = req.body;
  console.log("JobId :", fullJobId);
  const job = JobManager.getJob(fullJobId);
  // console.log(job);
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

  JobManager.cancelJob(fullJobId);
  res.json({ success: true, message: 'Job cancelled' });
});


// Helper methods
router.createPlanningSystemFromExcel = async function (data, planningStartDate, minEarlyDeliveryDays) {
  const planningSystem = new OrderPlanningSystem(planningStartDate, minEarlyDeliveryDays);

  try {
    // Load products with validation
    if (data.Products && Array.isArray(data.Products)) {
      data.Products.forEach((product, index) => {
        try {
          const productData = {
            productId: product.Product_ID || product.productId || product["Product Id"] || `PRODUCT_${index}`,
            productName: product.Product_Name || product.productName || product["Product Name"] || `Product ${index}`,
            productDescription: product.Product_Description || product.productDescription || product["Product Description"] || `Description ${index}`
          };
          planningSystem.addProduct(productData);
        } catch (error) {
          console.error(`Error loading product ${index}:`, error);
        }
      });
    }

    // Load line restrictions with weekly capacity
    if (data.Line_Restrictions && Array.isArray(data.Line_Restrictions)) {
      // First, collect weekly capacity data
      const capacityMap = {};
      if (data.Weekly_Capacity && Array.isArray(data.Weekly_Capacity)) {
        data.Weekly_Capacity.forEach((capacity) => {
          try {
            const restrictionName = capacity.Restriction_Name || capacity.restrictionName || capacity["Restriction Name"];
            const week = capacity.Week || capacity.week;
            const capacityValue = parseInt(capacity.Capacity || capacity.capacity) || 0;

            if (restrictionName && week) {
              if (!capacityMap[restrictionName]) {
                capacityMap[restrictionName] = {};
              }
              capacityMap[restrictionName][week] = capacityValue;
            }
          } catch (error) {
            console.error('Error loading capacity data:', error);
          }
        });
      }

      // Create line restrictions
      data.Line_Restrictions.forEach((restriction, index) => {
        try {
          const name = restriction.Restriction_Name || restriction.restrictionName || restriction["Restriction Name"] || `RESTRICTION_${index}`;
          const validity = restriction.Validity !== undefined ? restriction.Validity :
            restriction.validity !== undefined ? restriction.validity : true;
          const penaltyCost = parseFloat(restriction.Penalty_Cost || restriction.penaltyCost) || restriction["Penalty Cost"] || 500;

          let weeklyCapacity = capacityMap[name] || {};

          // If no weekly capacity data, create default
          if (Object.keys(weeklyCapacity).length === 0) {
            const defaultCapacity = parseInt(restriction.Avg_Weekly_Capacity || restriction.avgWeeklyCapacity || restriction["Avg Weekly Capacity"]) || 10;
            planningSystem.weeks.forEach(week => {
              weeklyCapacity[week] = defaultCapacity;
            });
          }

          const restrictionData = {
            restrictionName: name,
            validity: validity,
            penaltyCost: penaltyCost,
            weeklyCapacity: weeklyCapacity
          };

          planningSystem.addLineRestriction(restrictionData);
        } catch (error) {
          console.error(`Error loading restriction ${index}:`, error);
        }
      });
    }

    // Load operations with error handling
    if (data.Operations && Array.isArray(data.Operations)) {
      data.Operations.forEach((operation, index) => {
        try {
          const alternatesStr = operation.Alternate_Line_Restrictions || operation.alternateLineRestrictions || operation["Alternate Line Restrictions"] || '';
          const alternates = alternatesStr ?
            alternatesStr.split(',').map(s => s.trim()).filter(s => s && s !== 'nan' && s !== 'null') :
            [];

          planningSystem.addOperation({
            operationId: operation.Operation_ID || operation.operationId || operation["Operation Id"] || `OP_${index}`,
            primaryLineRestriction: operation.Primary_Line_Restriction || operation.primaryLineRestriction || operation["Primary Line Restriction"] || 'DEFAULT_LINE',
            alternateLineRestrictions: alternates
          });
        } catch (error) {
          console.error(`Error loading operation ${index}:`, error);
        }
      });
    }

    // Load sales orders with comprehensive error handling
    if (data.Sales_Orders && Array.isArray(data.Sales_Orders)) {
      data.Sales_Orders.forEach((order, index) => {
        try {
          // Parse components
          const components = {};
          const componentsStr = order.Components_Required || order.componentsRequired || order["Components Required"] || '';
          if (componentsStr) {
            componentsStr.split(',').forEach(comp => {
              const parts = comp.split(':');
              if (parts.length === 2) {
                const name = parts[0].trim();
                const qty = parseInt(parts[1].trim()) || 0;
                if (name && qty > 0) {
                  components[name] = qty;
                }
              }
            });
          }

          // Parse operations
          const operationsStr = order.Operations || order.operations || '';
          const operations = operationsStr ?
            operationsStr.split(',').map(op => op.trim()).filter(op => op) :
            ['DEFAULT_OP'];

          // Parse date
          let promiseDate;
          // try {
          //   promiseDate = moment(order.Order_Promise_Date || order.orderPromiseDate || order["Order Promise Date"]).toDate();
          //   if (!moment(promiseDate).isValid()) {
          //     promiseDate = moment().add(7, 'days').toDate(); // Default to 1 week from now
          //   }
          // } catch (error) {
          //   promiseDate = moment().add(7, 'days').toDate();
          // }
          function parseDate(dateValue) {
            // If it's already a valid Date object
            if (dateValue instanceof Date && !isNaN(dateValue)) {
              return dateValue;
            }
            
            // Convert to string for processing
            const dateStr = String(dateValue);
            
            // Check if it's a number (Excel serial date)
            if (!isNaN(dateValue) && !isNaN(parseFloat(dateValue))) {
              const num = parseFloat(dateValue);
              // Excel serial dates are typically > 1000
              if (num > 1000) {
                // Convert Excel serial date to JS Date
                const excelEpoch = new Date(1899, 11, 30);
                return new Date(excelEpoch.getTime() + (num * 24 * 60 * 60 * 1000));
              }
            }
            
            // Try parsing as regular date string
            return moment(dateStr).toDate();
          }
          
          // Updated code:
          try {
            const rawDate = order.Order_Promise_Date || order.orderPromiseDate || order["Order Promise Date"];
            promiseDate = parseDate(rawDate);
            
            if (!moment(promiseDate).isValid()) {
              promiseDate = moment().add(7, 'days').toDate();
            }
          } catch (error) {
            promiseDate = moment().add(7, 'days').toDate();
          }
          

          planningSystem.addSalesOrder({
            orderNumber: order.Order_Number || order.orderNumber || order["Order Number"] || `SO_${index}`,
            productId: order.Product_ID || order.productId || order["Product Id"] || 'DEFAULT_PRODUCT',
            orderPromiseDate: promiseDate,
            orderQty: parseInt(order.Order_Qty || order.orderQty || order["Order Qty"]) || 1,
            revenue: parseFloat(order.Revenue || order.revenue) || 1000,
            cost: parseFloat(order.Cost || order.cost) || 800,
            customerPriority: order.Customer_Priority || order.customerPriority || order["Customer Priority"] || 'Medium',
            operations: operations,
            components: components
          });
        } catch (error) {
          console.error(`Error loading sales order ${index}:`, error);
        }
      });
    }

    // Load penalty rules
    if (data.Penalty_Rules && Array.isArray(data.Penalty_Rules)) {
      data.Penalty_Rules.forEach((rule, index) => {
        try {
          planningSystem.addPenaltyRule({
            customerPriority: rule.Customer_Priority || rule.customerPriority || rule["Customer Priority"] || 'Medium',
            productId: rule.Product_ID || rule.productId || rule["Product Id"] || 'DEFAULT_PRODUCT',
            lateDeliveryPenalty: parseFloat(rule.Late_Delivery_Penalty || rule.lateDeliveryPenalty || rule["Late Delivery Penalty"]) || 100,
            noFulfillmentPenalty: parseFloat(rule.No_Fulfillment_Penalty || rule.noFulfillmentPenalty || rule["No Fulfillment Penalty"]) || 1000
          });
        } catch (error) {
          console.error(`Error loading penalty rule ${index}:`, error);
        }
      });
    }

    // Load priority delivery criteria
    if (data.Priority_Delivery_Criteria && Array.isArray(data.Priority_Delivery_Criteria)) {
      data.Priority_Delivery_Criteria.forEach((criteria, index) => {
        try {
          planningSystem.addPriorityDeliveryCriteria({
            customerPriority: criteria.Customer_Priority || criteria.customerPriority || criteria["Customer Priority"] || 'Medium',
            maxDelayDays: parseInt(criteria.Max_Delay_Days || criteria.maxDelayDays || criteria["Max Delay Days"]) || 7,
            penaltyMultiplier: parseFloat(criteria.Penalty_Multiplier || criteria.penaltyMultiplier || criteria["Penalty Multiplier"]) || 2.0,
            description: criteria.Description || criteria.description || criteria["Description"] || 'Loaded from Excel'
          });
        } catch (error) {
          console.error(`Error loading priority criteria ${index}:`, error);
        }
      });
    }

    // Load component availability
    if (data.Component_Availability && Array.isArray(data.Component_Availability)) {
      const componentMap = {};

      data.Component_Availability.forEach((comp) => {
        try {
          const componentId = comp.Component_ID || comp.componentId || comp["Component Id"];
          const week = comp.Week || comp.week;
          const quantity = parseInt(comp.Available_Quantity || comp.availableQuantity || comp["Available Quantity"]) || 0;

          if (componentId && week) {
            if (!componentMap[componentId]) {
              componentMap[componentId] = {};
            }
            componentMap[componentId][week] = quantity;
          }
        } catch (error) {
          console.error('Error loading component availability:', error);
        }
      });

      for (const [componentId, weeklyData] of Object.entries(componentMap)) {
        planningSystem.addComponentAvailability({
          componentId: componentId,
          weeklyAvailability: weeklyData
        });
      }
    }

    // Ensure data integrity
    planningSystem.ensureDataIntegrity();

    // CRITICAL: Validate capacity after loading all data
    const capacityValidation = planningSystem.validateCapacityForOptimization();
    
    if (!capacityValidation.isValid) {
      const errorMessage = `Excel file validation failed: ${capacityValidation.criticalIssues.join(', ')}`;
      console.error('🚫 Excel Validation Failed:', errorMessage);
      throw new Error(errorMessage);
    }

    // Log validation summary
    const summary = planningSystem.getCapacityValidationSummary();
    console.log('✅ Excel Capacity Validation Passed:', summary.summary);
    if (summary.issues.length > 0) {
      console.warn('⚠️ Excel Capacity Issues Found:', summary.issues);
    }

    return planningSystem;

  } catch (error) {
    console.error('Critical error in createPlanningSystemFromExcel:', error);
    throw error;
  }
};

router.createPlanningSystemFromJSON = function (jsonData) {
  const planningSystem = new OrderPlanningSystem(jsonData.planningStartDate, jsonData.minEarlyDeliveryDays);

  // Restore data from JSON
  Object.entries(jsonData.products).forEach(([key, value]) => {
    planningSystem.products.set(key, value);
  });

  Object.entries(jsonData.lineRestrictions).forEach(([key, value]) => {
    planningSystem.lineRestrictions.set(key, value);
  });

  Object.entries(jsonData.operations).forEach(([key, value]) => {
    planningSystem.operations.set(key, value);
  });

  Object.entries(jsonData.salesOrders).forEach(([key, value]) => {
    planningSystem.salesOrders.set(key, value);
  });

  Object.entries(jsonData.penaltyRules).forEach(([key, value]) => {
    planningSystem.penaltyRules.set(key, value);
  });

  Object.entries(jsonData.componentAvailability).forEach(([key, value]) => {
    planningSystem.componentAvailability.set(key, value);
  });
  //New code added 23/06/2025 - Pradeep
  Object.entries(jsonData.priorityDeliveryCriteria || {}).forEach(([key, value]) => {
    planningSystem.priorityDeliveryCriteria.set(key, value);
  });

  return planningSystem;
};

router.get('/download-sample', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'sample_data.xlsx');
  res.download(filePath, 'sample_data.xlsx', (err) => {
    if (err) {
      console.error('Download failed:', err);
      res.status(500).send('File download failed');
    }
  });
});

router.get('/download-results', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'optimization_results.xlsx');
  res.download(filePath, 'optimization_results.xlsx', (err) => {
    if (err) {
      console.error('Download failed:', err);
      res.status(500).send('File download failed');
    }
  });
});
//New code changes 24/06/2025 based on verison 3 by Ashok-Pradeep
router.get('/downloadPivot-results', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'optimization_results_Capacity_Pivot.xlsx');
  res.download(filePath, 'optimization_results_Capacity_Pivot.xlsx', (err) => {
    if (err) {
      console.error('Download failed:', err);
      res.status(500).send('File download failed');
    }
  });
});
//New code changes 23/06/2025-Pradeep
router.calculateTimingMetrics = function (analysisResults) {
  const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid && typeof order.delayDays === 'number');

  if (validOrders.length === 0) {
    return {
      averageDeviation: 0,
      averageAbsoluteDeviation: 0,
      ordersWithinOneWeek: 0,
      ordersWithinTwoWeeks: 0,
      unnecessaryDelays: 0,
      perfectTiming: 0,
      percentageWithinOneWeek: "0%",
      percentageWithinTwoWeeks: "0%"
    };
  }

  const delays = validOrders.map(order => order.delayDays);
  const absoluteDelays = delays.map(delay => Math.abs(delay));

  return {
    averageDeviation: (delays.reduce((sum, delay) => sum + delay, 0) / validOrders.length).toFixed(1),
    averageAbsoluteDeviation: (absoluteDelays.reduce((sum, delay) => sum + delay, 0) / validOrders.length).toFixed(1),
    ordersWithinOneWeek: validOrders.filter(order => Math.abs(order.delayDays) <= 7).length,
    ordersWithinTwoWeeks: validOrders.filter(order => Math.abs(order.delayDays) <= 14).length,
    unnecessaryDelays: validOrders.filter(order => order.delayDays > 7).length,
    perfectTiming: validOrders.filter(order => order.delayDays === 0).length,
    percentageWithinOneWeek: (validOrders.filter(order => Math.abs(order.delayDays) <= 7).length / validOrders.length * 100).toFixed(1) + "%",
    percentageWithinTwoWeeks: (validOrders.filter(order => Math.abs(order.delayDays) <= 14).length / validOrders.length * 100).toFixed(1) + "%"
  };
};
//New code changes 23/06/2025-Pradeep
//New code changes 24/06/2025 based on version 3-Pradeep

router.analyzeCapacityViolations = function (analysisResults) {
  const violations = [];
  let totalViolations = 0;

  // This would need access to the solution and system to calculate violations
  // For now, return summary stats
  return {
    totalViolations: totalViolations,
    severeViolations: 0,
    violationsByLine: {},
    message: totalViolations === 0 ? 'No capacity violations detected' : `${totalViolations} capacity violations found`
  };
};

//Generate Sample Data Daily 02/07/2025- creating daily schedules instead of weeks.
router.post('/generate-sample-daily', async (req, res) => {
  try {
    const { planningStartDate, minEarlyDeliveryDays } = req.body;

    const planningSystem = new OrderPlanningSystemDaily(planningStartDate, minEarlyDeliveryDays);
    planningSystem.loadSampleData();


    const excelHandler = new ExcelHandler();
    const publicDir = path.join(__dirname, '..', 'public');
    const filePath = path.join(publicDir, 'sample_data_daily.xlsx');
    await excelHandler.createSampleDataFileDaily(planningSystem, filePath);
    res.setHeader('Content-Disposition', `attachment; filename="sample_data_daily.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    console.log("Data created");
    // await excelHandler.streamExcelToResponse(res, data);
    console.log("Response");
    res.json({
      success: true,
      message: 'Sample data daily schedule generated successfully',
      downloadUrl: '/static/sample_data_daily.xlsx',
      summary: {
        products: planningSystem.products.size,
        salesOrders: planningSystem.salesOrders.size,
        lineRestrictions: planningSystem.lineRestrictions.size,
        planningStartDate: planningSystem.planningStartDate.format('YYYY-MM-DD'),
        minEarlyDeliveryDays: planningSystem.minEarlyDeliveryDays
      }
    });
    return res;

  } catch (error) {
    logger.error('Error generating sample data daily:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate sample data daily',
      message: error.message
    });
  }
});

router.post('/uploadDaily', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { planningStartDate, minEarlyDeliveryDays = 7 } = req.body;

    logger.info(`Processing uploaded file: ${req.file.originalname}`);

    const excelHandler = new ExcelHandler();
    const data = await excelHandler.readExcelFile(req.file.path);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    // Create planning system from Excel data
    const planningSystem = await router.createPlanningSystemFromExcelDaily(data, planningStartDate, minEarlyDeliveryDays);

    // Store in session or cache (simplified for this example)
    // req.session = req.session || {};
    console.log("Session at optimize:", req.session);
    req.session.planningSystem = planningSystem.toJSON();

    res.json({
      success: true,
      message: 'File processed successfully',
      summary: {
        planningSystem: planningSystem.toJSON(),
        products: planningSystem.products.size,
        salesOrders: planningSystem.salesOrders.size,
        lineRestrictions: planningSystem.lineRestrictions.size,
        planningStartDate: planningSystem.planningStartDate.format('YYYY-MM-DD'),
        minEarlyDeliveryDays: planningSystem.minEarlyDeliveryDays
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => { });
    }

    logger.error('Error processing uploaded file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process uploaded file',
      message: error.message
    });
  }
});

router.createPlanningSystemFromExcelDaily = async function (data, planningStartDate, minEarlyDeliveryDays) {
  const planningSystem = new OrderPlanningSystemDaily(planningStartDate, minEarlyDeliveryDays);

  try {
    // Load products with validation
    if (data.Products && Array.isArray(data.Products)) {
      data.Products.forEach((product, index) => {
        try {
          const productData = {
            productId: product.Product_ID || product.productId || product["Product Id"] || `PRODUCT_${index}`,
            productName: product.Product_Name || product.productName || product["Product Name"] || `Product ${index}`,
            productDescription: product.Product_Description || product.productDescription || product["Product Description"] || `Description ${index}`
          };
          planningSystem.addProduct(productData);
        } catch (error) {
          console.error(`Error loading product ${index}:`, error);
        }
      });
    }

    // Load line restrictions with weekly capacity
    if (data.Line_Restrictions && Array.isArray(data.Line_Restrictions)) {
      // First, collect weekly capacity data
      const capacityMap = {};
      if (data.Weekly_Capacity && Array.isArray(data.Weekly_Capacity)) {
        data.Weekly_Capacity.forEach((capacity) => {
          try {
            const restrictionName = capacity.Restriction_Name || capacity.restrictionName || capacity["Restriction Name"];
            const week = capacity.Week || capacity.week;
            const capacityValue = parseInt(capacity.Capacity || capacity.capacity) || 0;

            if (restrictionName && week) {
              if (!capacityMap[restrictionName]) {
                capacityMap[restrictionName] = {};
              }
              capacityMap[restrictionName][week] = capacityValue;
            }
          } catch (error) {
            console.error('Error loading capacity data:', error);
          }
        });
      }

      // Create line restrictions
      data.Line_Restrictions.forEach((restriction, index) => {
        try {
          const name = restriction.Restriction_Name || restriction.restrictionName || restriction["Restriction Name"] || `RESTRICTION_${index}`;
          const validity = restriction.Validity !== undefined ? restriction.Validity :
            restriction.validity !== undefined ? restriction.validity : true;
          const penaltyCost = parseFloat(restriction.Penalty_Cost || restriction.penaltyCost) || restriction["Penalty Cost"] || 500;

          let weeklyCapacity = capacityMap[name] || {};

          // If no weekly capacity data, create default
          if (Object.keys(weeklyCapacity).length === 0) {
            const defaultCapacity = parseInt(restriction.Avg_Weekly_Capacity || restriction.avgWeeklyCapacity || restriction["Avg Weekly Capacity"]) || 10;
            planningSystem.weeks.forEach(week => {
              weeklyCapacity[week] = defaultCapacity;
            });
          }

          const restrictionData = {
            restrictionName: name,
            validity: validity,
            penaltyCost: penaltyCost,
            weeklyCapacity: weeklyCapacity
          };

          planningSystem.addLineRestriction(restrictionData);
        } catch (error) {
          console.error(`Error loading restriction ${index}:`, error);
        }
      });
    }

    // Load operations with error handling
    if (data.Operations && Array.isArray(data.Operations)) {
      data.Operations.forEach((operation, index) => {
        try {
          const alternatesStr = operation.Alternate_Line_Restrictions || operation.alternateLineRestrictions || operation["Alternate Line Restrictions"] || '';
          const alternates = alternatesStr ?
            alternatesStr.split(',').map(s => s.trim()).filter(s => s && s !== 'nan' && s !== 'null') :
            [];

          planningSystem.addOperation({
            operationId: operation.Operation_ID || operation.operationId || operation["Operation Id"] || `OP_${index}`,
            primaryLineRestriction: operation.Primary_Line_Restriction || operation.primaryLineRestriction || operation["Primary Line Restriction"] || 'DEFAULT_LINE',
            alternateLineRestrictions: alternates
          });
        } catch (error) {
          console.error(`Error loading operation ${index}:`, error);
        }
      });
    }

    // Load sales orders with comprehensive error handling
    if (data.Sales_Orders && Array.isArray(data.Sales_Orders)) {
      data.Sales_Orders.forEach((order, index) => {
        try {
          // Parse components
          const components = {};
          const componentsStr = order.Components_Required || order.componentsRequired || order["Components Required"] || '';
          if (componentsStr) {
            componentsStr.split(',').forEach(comp => {
              const parts = comp.split(':');
              if (parts.length === 2) {
                const name = parts[0].trim();
                const qty = parseInt(parts[1].trim()) || 0;
                if (name && qty > 0) {
                  components[name] = qty;
                }
              }
            });
          }

          // Parse operations
          const operationsStr = order.Operations || order.operations || '';
          const operations = operationsStr ?
            operationsStr.split(',').map(op => op.trim()).filter(op => op) :
            ['DEFAULT_OP'];

          // Parse date
          let promiseDate;
          try {
            promiseDate = moment(order.Order_Promise_Date || order.orderPromiseDate || order["Order Promise Date"]).toDate();
            if (!moment(promiseDate).isValid()) {
              promiseDate = moment().add(7, 'days').toDate(); // Default to 1 week from now
            }
          } catch (error) {
            promiseDate = moment().add(7, 'days').toDate();
          }

          planningSystem.addSalesOrder({
            orderNumber: order.Order_Number || order.orderNumber || order["Order Number"] || `SO_${index}`,
            productId: order.Product_ID || order.productId || order["Product Id"] || 'DEFAULT_PRODUCT',
            orderPromiseDate: promiseDate,
            orderQty: parseInt(order.Order_Qty || order.orderQty || order["Order Qty"]) || 1,
            revenue: parseFloat(order.Revenue || order.revenue) || 1000,
            cost: parseFloat(order.Cost || order.cost) || 800,
            customerPriority: order.Customer_Priority || order.customerPriority || order["Customer Priority"] || 'Medium',
            operations: operations,
            components: components
          });
        } catch (error) {
          console.error(`Error loading sales order ${index}:`, error);
        }
      });
    }

    // Load penalty rules
    if (data.Penalty_Rules && Array.isArray(data.Penalty_Rules)) {
      data.Penalty_Rules.forEach((rule, index) => {
        try {
          planningSystem.addPenaltyRule({
            customerPriority: rule.Customer_Priority || rule.customerPriority || rule["Customer Priority"] || 'Medium',
            productId: rule.Product_ID || rule.productId || rule["Product Id"] || 'DEFAULT_PRODUCT',
            lateDeliveryPenalty: parseFloat(rule.Late_Delivery_Penalty || rule.lateDeliveryPenalty || rule["Late Delivery Penalty"]) || 100,
            noFulfillmentPenalty: parseFloat(rule.No_Fulfillment_Penalty || rule.noFulfillmentPenalty || rule["No Fulfillment Penalty"]) || 1000
          });
        } catch (error) {
          console.error(`Error loading penalty rule ${index}:`, error);
        }
      });
    }

    // Load priority delivery criteria
    if (data.Priority_Delivery_Criteria && Array.isArray(data.Priority_Delivery_Criteria)) {
      data.Priority_Delivery_Criteria.forEach((criteria, index) => {
        try {
          planningSystem.addPriorityDeliveryCriteria({
            customerPriority: criteria.Customer_Priority || criteria.customerPriority || criteria["Customer Priority"] || 'Medium',
            maxDelayDays: parseInt(criteria.Max_Delay_Days || criteria.maxDelayDays || criteria["Max Delay Days"]) || 7,
            penaltyMultiplier: parseFloat(criteria.Penalty_Multiplier || criteria.penaltyMultiplier || criteria["Penalty Multiplier"]) || 2.0,
            description: criteria.Description || criteria.description || criteria["Description"] || 'Loaded from Excel'
          });
        } catch (error) {
          console.error(`Error loading priority criteria ${index}:`, error);
        }
      });
    }

    // Load component availability
    if (data.Component_Availability && Array.isArray(data.Component_Availability)) {
      const componentMap = {};

      data.Component_Availability.forEach((comp) => {
        try {
          const componentId = comp.Component_ID || comp.componentId || comp["Component Id"];
          const week = comp.Week || comp.week;
          const quantity = parseInt(comp.Available_Quantity || comp.availableQuantity || comp["Available Quantity"]) || 0;

          if (componentId && week) {
            if (!componentMap[componentId]) {
              componentMap[componentId] = {};
            }
            componentMap[componentId][week] = quantity;
          }
        } catch (error) {
          console.error('Error loading component availability:', error);
        }
      });

      for (const [componentId, weeklyData] of Object.entries(componentMap)) {
        planningSystem.addComponentAvailability({
          componentId: componentId,
          weeklyAvailability: weeklyData
        });
      }
    }

    // Ensure data integrity
    // planningSystem.ensureDataIntegrity();

    return planningSystem;

  } catch (error) {
    console.error('Critical error in createPlanningSystemFromExcel:', error);
    throw error;
  }
};

// Start async optimization
router.post('/optimizeDaily', async (req, res) => {
  const {
    planningSystem: planningSystemJSON,
    planningStartDate,
    minEarlyDeliveryDays = 7,
    populationSize = 100,
    generations = 50,
    mutationRate = 0.1,
    crossoverRate = 0.8
  } = req.body;
  let planningSystem = (planningSystemJSON && Object.keys(planningSystemJSON).length > 0)
    ? router.createPlanningSystemFromJSONDaily(planningSystemJSON)
    : new OrderPlanningSystem(planningStartDate, minEarlyDeliveryDays);
  if (!planningSystemJSON) planningSystem.loadSampleData();
  const optimizer = new GeneticAlgorithmOptimizerDaily(planningSystem, {
    populationSize, generations, mutationRate, crossoverRate,
    //New code added on 23/06/2025- Pradeep
    promiseDatePreference: req.body.promiseDatePreference || 0.7,
    timingVarianceDays: req.body.timingVarianceDays || 7,
    unnecessaryDelayPenalty: req.body.unnecessaryDelayPenalty || 100,
    perfectTimingBonus: req.body.perfectTimingBonus || 50
    //New code added on 23/06/2025- Pradeep
  });
  const jobId = JobManager.createJob(optimizer);
  console.time('📤 Sending Response');
  res.json({ success: true, jobId });
  res.end();
  console.timeEnd('📤 Sending Response');

  // ✅ Fire-and-forget background execution
  setImmediate(() => {
    (async () => {
      try {
        console.time('🧵 Background Optimization');
        const optimizationResult = await optimizer.optimize();
        const analyzer = new ResultsAnalyzerDaily(planningSystem);
        const analysisResults = analyzer.analyzeSolution(optimizationResult.bestSolution);
        const comparisonReport = analyzer.generateComparisonReport(analysisResults);
        //New code added on 23/06/2025- Pradeep
        const timingMetrics = router.calculateTimingMetrics(analysisResults);
        //New code added on 23/06/2025- Pradeep
        const excelHandler = new ExcelHandler();
        const publicDir = path.join(__dirname, '..', 'public');
        const resultsFilePath = path.join(publicDir, 'optimization_results_daily.xlsx');

        await excelHandler.createResultsFile(
          analysisResults,
          optimizationResult.bestSolution,
          optimizationResult.fitnessHistory,
          resultsFilePath
        );

        JobManager.setCompleted(jobId, {
          summary: comparisonReport.summary,
          performanceMetrics: comparisonReport.performanceMetrics,
          priorityBreakdown: comparisonReport.priorityBreakdown,
          priorityCompliance: comparisonReport.priorityCompliance, // New line added 23/06/2025 - Pradeep
          capacityUtilization: comparisonReport.capacityUtilization,
          //New code added on 23/06/2025- Pradeep
          timingMetrics: timingMetrics,
          //New code added on 23/06/2025- Pradeep
          finalFitness: optimizationResult.finalFitness,
          generations: optimizationResult.fitnessHistory.length,
          capacityViolations: router.analyzeCapacityViolations(analysisResults),// New line added 24/06/2025 based on version 3 ashok- Pradeep
          pivotTableInfo: {
            description: 'Capacity pivot table created',
            mainFile: '/static/optimization_results_daily.xlsx',
            pivotFile: '/static/optimization_results_Capacity_Pivot_daily.xlsx'
          }, // New line added 24/06/2025 based on version 3 ashok- Pradeep
          downloadUrl: '/static/optimization_results_daily.xlsx',
          pivotDownloadUrl: '/static/optimization_results_Capacity_Pivot_daily.xlsx' // New line added 24/06/2025 based on version 3 ashok- Pradeep
        });
      } catch (err) {
        if (err.message.includes('cancelled')) {
          console.log('🛑 Optimization was cancelled');
          JobManager.setError(jobId, 'Optimization was cancelled by user');
        } else {
          console.error('❌ Optimization failed:', err);
          JobManager.setError(jobId, err.message);
        }
        // JobManager.setError(jobId, err.message);
      }
      console.timeEnd('🧵 Background Optimization');

    })(); // ⬅️ Do NOT `await` this!
  });

});

router.createPlanningSystemFromJSONDaily = function (jsonData) {
  const planningSystem = new OrderPlanningSystemDaily(jsonData.planningStartDate, jsonData.minEarlyDeliveryDays);

  // Restore data from JSON
  Object.entries(jsonData.products).forEach(([key, value]) => {
    planningSystem.products.set(key, value);
  });

  Object.entries(jsonData.lineRestrictions).forEach(([key, value]) => {
    planningSystem.lineRestrictions.set(key, value);
  });

  Object.entries(jsonData.operations).forEach(([key, value]) => {
    planningSystem.operations.set(key, value);
  });

  Object.entries(jsonData.salesOrders).forEach(([key, value]) => {
    planningSystem.salesOrders.set(key, value);
  });

  Object.entries(jsonData.penaltyRules).forEach(([key, value]) => {
    planningSystem.penaltyRules.set(key, value);
  });

  Object.entries(jsonData.componentAvailability).forEach(([key, value]) => {
    planningSystem.componentAvailability.set(key, value);
  });
  Object.entries(jsonData.priorityDeliveryCriteria || {}).forEach(([key, value]) => {
    planningSystem.priorityDeliveryCriteria.set(key, value);
  });

  return planningSystem;
};

router.get('/download-sample-daily', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'sample_data_daily.xlsx');
  res.download(filePath, 'sample_data_daily.xlsx', (err) => {
    if (err) {
      console.error('Download failed:', err);
      res.status(500).send('File download failed');
    }
  });
});

router.get('/download-results-daily', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'optimization_results_daily.xlsx');
  res.download(filePath, 'optimization_results_daily.xlsx', (err) => {
    if (err) {
      console.error('Download failed:', err);
      res.status(500).send('File download failed');
    }
  });
});
router.get('/downloadPivot-results-daily', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'optimization_results_daily_Capacity_Pivot.xlsx');
  res.download(filePath, 'optimization_results_daily_Capacity_Pivot.xlsx', (err) => {
    if (err) {
      console.error('Download failed:', err);
      res.status(500).send('File download failed');
    }
  });
});
module.exports = router;