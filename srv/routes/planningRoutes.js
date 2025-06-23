// src/routes/planningRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const OrderPlanningSystem = require(path.resolve(__dirname, '../core/OrderPlanningSystem'));
const GeneticAlgorithmOptimizer = require(path.resolve(__dirname, '../optimization/GeneticAlgorithmOptimizer'));
const ResultsAnalyzer = require(path.resolve(__dirname, '../analysis/ResultsAnalyzer'));
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

    logger.error('Error processing uploaded file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process uploaded file',
      message: error.message
    });
  }
});

// Run optimization
// router.post('/optimize', async (req, res) => {
//   try {
//     const {
//       planningSystem: planningSystemJSON,
//       planningStartDate,
//       minEarlyDeliveryDays = 7,
//       populationSize = 100,
//       generations = 50,
//       mutationRate = 0.1,
//       crossoverRate = 0.8
//     } = req.body;

//     // Create or load planning system
//     let planningSystem;
//     if (planningSystemJSON && Object.keys(planningSystemJSON).length>0) {
//       planningSystem = router.createPlanningSystemFromJSON(planningSystemJSON);
//     } else {
//       planningSystem = new OrderPlanningSystem(planningStartDate, minEarlyDeliveryDays);
//       planningSystem.loadSampleData();
//     }

//     logger.info('Starting optimization process...');

//     // Run genetic algorithm optimization
//     const optimizer = new GeneticAlgorithmOptimizer(planningSystem, {
//       populationSize,
//       generations,
//       mutationRate,
//       crossoverRate
//     });

//     const optimizationResult = await optimizer.optimize();

//     // Analyze results
//     const analyzer = new ResultsAnalyzer(planningSystem);
//     const analysisResults = analyzer.analyzeSolution(optimizationResult.bestSolution);

//     // Generate comparison report
//     const comparisonReport = analyzer.generateComparisonReport(analysisResults);

//     // Create Excel results file
//     const excelHandler = new ExcelHandler();
//     const publicDir = path.join(__dirname, '..', 'public');
//     const resultsFilePath = path.join(publicDir, 'optimization_results.xlsx');

//     await excelHandler.createResultsFile(
//       analysisResults,
//       optimizationResult.bestSolution,
//       optimizationResult.fitnessHistory,
//       resultsFilePath
//     );
//     res.setHeader('Content-Disposition', 'attachment; filename="optimization_results.xlsx"');
//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

//     // await excelHandler.streamResultsToResponse(
//     //   res,
//     //   analysisResults,
//     //   optimizationResult.bestSolution,
//     //   optimizationResult.fitnessHistory
//     // );
//     // res.download(filePath, 'optimization_results.xlsx');
//     res.json({
//       success: true,
//       message: 'Optimization completed successfully',
//       results: {
//         summary: comparisonReport.summary,
//         performanceMetrics: comparisonReport.performanceMetrics,
//         priorityBreakdown: comparisonReport.priorityBreakdown,
//         capacityUtilization: comparisonReport.capacityUtilization,
//         finalFitness: optimizationResult.finalFitness,
//         generations: optimizationResult.fitnessHistory.length
//       },
//       downloadUrl: '/static/optimization_results.xlsx'
//     });

//   } catch (error) {
//     logger.error('Error during optimization:', error);
//     res.status(200).json({
//       success: false,
//       error: 'Optimization failed',
//       message: error.message
//     });
//   }
// });

// Start async optimization
router.post('/optimize', async (req, res) => {
  console.time('💡 Total Handler Time');
  console.time('🔧 Planning System Init');
  console.time('📥 Request Processing');
  const {
    planningSystem: planningSystemJSON,
    planningStartDate,
    minEarlyDeliveryDays = 7,
    populationSize = 100,
    generations = 50,
    mutationRate = 0.1,
    crossoverRate = 0.8
  } = req.body;
  console.timeEnd('📥 Request Processing');
  console.time('🏗️ JSON to Planning System');
  let planningSystem = (planningSystemJSON && Object.keys(planningSystemJSON).length > 0)
    ? router.createPlanningSystemFromJSON(planningSystemJSON)
    : new OrderPlanningSystem(planningStartDate, minEarlyDeliveryDays);
  console.timeEnd('🏗️ JSON to Planning System');
  console.time('📊 Load Sample Data');
  if (!planningSystemJSON) planningSystem.loadSampleData();
  console.timeEnd('📊 Load Sample Data');
  console.timeEnd('🔧 Planning System Init');

  console.time('🧠 Optimizer Init');
  const optimizer = new GeneticAlgorithmOptimizer(planningSystem, {
    populationSize, generations, mutationRate, crossoverRate,
    //New code added on 23/06/2025- Pradeep
    promiseDatePreference: req.body.promiseDatePreference || 0.7,
    timingVarianceWeeks: req.body.timingVarianceWeeks || 3,
    unnecessaryDelayPenalty: req.body.unnecessaryDelayPenalty || 100,
    perfectTimingBonus: req.body.perfectTimingBonus || 50
    //New code added on 23/06/2025- Pradeep
  });
  console.timeEnd('🧠 Optimizer Init');
  console.time('📦 Job Creation');
  const jobId = JobManager.createJob(optimizer);
  console.timeEnd('📦 Job Creation');
  console.time('📤 Sending Response');
  res.json({ success: true, jobId });
  res.end();
  console.timeEnd('📤 Sending Response');
  console.timeEnd('💡 Total Handler Time');

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
          capacityUtilization: comparisonReport.capacityUtilization,
          //New code added on 23/06/2025- Pradeep
          timingMetrics: timingMetrics,
          //New code added on 23/06/2025- Pradeep
          finalFitness: optimizationResult.finalFitness,
          generations: optimizationResult.fitnessHistory.length,
          downloadUrl: '/static/optimization_results.xlsx'
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

  // Load products
  if (data.Products) {
    data.Products.forEach(product => {
      planningSystem.addProduct({
        productId: product.Product_ID || product.productId || product["Product Id"],
        productName: product.Product_Name || product.productName || product["Product Name"],
        productDescription: product.Product_Description || product.productDescription || product["Product Description"]
      });
    });
  }

  // Load line restrictions
  if (data.Line_Restrictions && data.Weekly_Capacity) {
    const capacityMap = {};
    data.Weekly_Capacity.forEach(capacity => {
      if (!capacityMap[capacity.Restriction_Name || capacity.restrictionName || "Restriction Name"]) {
        capacityMap[capacity.Restriction_Name || capacity.restrictionName || "Restriction Name"] = {};
      }
      capacityMap[capacity.Restriction_Name || capacity.restrictionName || "Restriction Name"][capacity.Week || capacity.week] =
        capacity.Capacity || capacity.capacity;
    });

    data.Line_Restrictions.forEach(restriction => {
      const name = restriction.Restriction_Name || restriction.restrictionName || restriction["Restriction Name"];
      planningSystem.addLineRestriction({
        restrictionName: name,
        validity: restriction.Validity !== undefined ? restriction.Validity : restriction.validity,
        penaltyCost: restriction.Penalty_Cost || restriction.penaltyCost || restriction["Penalty Cost"],
        weeklyCapacity: capacityMap[name] || {}
      });
    });
  }

  // Load operations
  if (data.Operations) {
    data.Operations.forEach(operation => {
      const alternates = (operation.Alternate_Line_Restrictions || operation.alternateLineRestrictions || '' || operation["Alternate Line Restrictions"])
        .split(',').map(s => s.trim()).filter(s => s);

      planningSystem.addOperation({
        operationId: operation.Operation_ID || operation.operationId || operation["Operation Id"],
        primaryLineRestriction: operation.Primary_Line_Restriction || operation.primaryLineRestriction || operation["Primary Line Restriction"],
        alternateLineRestrictions: alternates
      });
    });
  }

  // Load sales orders
  if (data.Sales_Orders) {
    data.Sales_Orders.forEach(order => {
      const operations = (order.Operations || order.operations || '')
        .split(',').map(s => s.trim()).filter(s => s);

      const components = {};
      const componentsStr = order.Components_Required || order.componentsRequired || order["Components Required"] || '';
      if (componentsStr) {
        componentsStr.split(',').forEach(comp => {
          const [name, qty] = comp.split(':').map(s => s.trim());
          if (name && qty) {
            components[name] = parseInt(qty) || 0;
          }
        });
      }

      planningSystem.addSalesOrder({
        orderNumber: order.Order_Number || order.orderNumber || order["Order Number"],
        productId: order.Product_ID || order.productId || order["Product Id"],
        orderPromiseDate: order.Order_Promise_Date || order.orderPromiseDate || order["Order Promise Date"],
        orderQty: order.Order_Qty || order.orderQty || order["Order Qty"],
        revenue: order.Revenue || order.revenue,
        cost: order.Cost || order.cost,
        customerPriority: order.Customer_Priority || order.customerPriority || order["Customer Priority"],
        operations: operations,
        components: components
      });
    });
  }

  // Load penalty rules
  if (data.Penalty_Rules) {
    data.Penalty_Rules.forEach(rule => {
      planningSystem.addPenaltyRule({
        customerPriority: rule.Customer_Priority || rule.customerPriority || rule["Customer Priority"],
        productId: rule.Product_ID || rule.productId || rule["Product Id"],
        lateDeliveryPenalty: rule.Late_Delivery_Penalty || rule.lateDeliveryPenalty || rule["Late Delivery Penalty"],
        noFulfillmentPenalty: rule.No_Fulfillment_Penalty || rule.noFulfillmentPenalty || rule["No Fulfillment Penalty"]
      });
    });
  }

  // Load component availability
  if (data.Component_Availability) {
    const componentMap = {};
    data.Component_Availability.forEach(comp => {
      const componentId = comp.Component_ID || comp.componentId || comp["Component Id"];
      if (!componentMap[componentId]) {
        componentMap[componentId] = {};
      }
      componentMap[componentId][comp.Week || comp.week] = comp.Available_Quantity || comp.availableQuantity || comp["Component Id"];
    });

    for (const [componentId, weeklyAvailability] of Object.entries(componentMap)) {
      planningSystem.addComponentAvailability({
        componentId: componentId,
        weeklyAvailability: weeklyAvailability
      });
    }
  }

  return planningSystem;
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
module.exports = router;