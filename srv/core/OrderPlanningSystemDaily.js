const moment = require('moment');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Logger = require(path.resolve(__dirname, '../utils/Logger'));

// class OrderPlanningSystemDaily {
//   constructor(planningStartDate = null, minEarlyDeliveryDays = 7) {
//     this.products = new Map();
//     this.lineRestrictions = new Map();
//     this.operations = new Map();
//     this.salesOrders = new Map();
//     this.penaltyRules = new Map();
//     this.componentAvailability = new Map();
//     this.priorityDeliveryCriteria = new Map();
//     this.planningStartDate = planningStartDate ? moment(planningStartDate) : moment();
//     this.minEarlyDeliveryDays = minEarlyDeliveryDays;
    
//     // NEW: Daily buckets instead of weekly
//     this.planningHorizonDays = 365; // 1 year planning horizon
//     this.dailyBuckets = this.generateDailyBuckets();
//     this.currentDayIndex = this.getCurrentDayIndex();
    
//     // NEW: Under-utilization penalty configuration
//     this.underUtilizationConfig = {
//       baseNearTermPenalty: 50.0,    // High penalty for near-term under-utilization
//       baseFutureTermPenalty: 5.0,   // Low penalty for future under-utilization
//       nearTermDays: 30,             // Days considered "near-term"
//       decayRate: 0.95,              // Exponential decay rate
//       targetUtilizationRate: 0.75   // Target 75% capacity utilization
//     };
    
//     this.logger = Logger.getInstance();
//   }

//   // NEW: Generate daily buckets instead of weekly
//   generateDailyBuckets(numDays = null) {
//     const days = [];
//     const totalDays = numDays || this.planningHorizonDays;
//     const baseDate = this.planningStartDate.clone();

//     for (let i = 0; i < totalDays; i++) {
//       const dayDate = baseDate.clone().add(i, 'days');
//       days.push({
//         date: dayDate.format('YYYY-MM-DD'),
//         dayIndex: i,
//         weekday: dayDate.format('dddd'),
//         isWeekend: dayDate.day() === 0 || dayDate.day() === 6
//       });
//     }

//     return days;
//   }

//   getCurrentDayIndex() {
//     const currentDate = moment().format('YYYY-MM-DD');
//     const planningStartDateStr = this.planningStartDate.format('YYYY-MM-DD');
    
//     if (currentDate < planningStartDateStr) {
//       return 0; // Current date is before planning start
//     }
    
//     const daysDiff = moment(currentDate).diff(this.planningStartDate, 'days');
//     return Math.max(0, daysDiff);
//   }

//   getEarliestSchedulableDayIndex() {
//     // Never allow scheduling in the past
//     return Math.max(this.getCurrentDayIndex(), 0);
//   }

//   getEarliestSchedulableDayForOrder(orderNumber) {
//     const order = this.salesOrders.get(orderNumber);
//     if (!order) return this.getEarliestSchedulableDayIndex();

//     const promiseDate = moment(order.orderPromiseDate);
//     const earliestDeliveryDate = promiseDate.clone().subtract(this.minEarlyDeliveryDays, 'days');
//     const constraintDate = moment.max(earliestDeliveryDate, this.planningStartDate);
    
//     // Ensure we never schedule in the past
//     const currentDate = moment();
//     const effectiveConstraintDate = moment.max(constraintDate, currentDate);

//     const daysDiff = effectiveConstraintDate.diff(this.planningStartDate, 'days');
//     return Math.max(daysDiff >= 0 ? daysDiff : this.getEarliestSchedulableDayIndex(), this.getEarliestSchedulableDayIndex());
//   }

//   // NEW: Calculate under-utilization penalty for a specific day
//   calculateUnderUtilizationPenalty(dayIndex, actualUtilization, maxCapacity) {
//     if (maxCapacity === 0) return 0;
    
//     const utilizationRate = actualUtilization / maxCapacity;
//     const targetRate = this.underUtilizationConfig.targetUtilizationRate;
    
//     if (utilizationRate >= targetRate) return 0; // No penalty if above target
    
//     const underUtilization = targetRate - utilizationRate;
    
//     // Calculate distance-based penalty decay
//     let penaltyMultiplier;
//     if (dayIndex <= this.underUtilizationConfig.nearTermDays) {
//       // Near-term: high penalty with linear decay
//       const daysFactor = (this.underUtilizationConfig.nearTermDays - dayIndex) / this.underUtilizationConfig.nearTermDays;
//       penaltyMultiplier = this.underUtilizationConfig.baseNearTermPenalty * daysFactor;
//     } else {
//       // Future-term: exponential decay
//       const daysFromNearTerm = dayIndex - this.underUtilizationConfig.nearTermDays;
//       penaltyMultiplier = this.underUtilizationConfig.baseFutureTermPenalty * 
//                          Math.pow(this.underUtilizationConfig.decayRate, daysFromNearTerm / 10);
//     }
    
//     return underUtilization * maxCapacity * penaltyMultiplier;
//   }

//   addProduct(product) {
//     this.products.set(product.productId, product);
//     this.logger.info(`Added product: ${product.productId}`);
//   }

//   addLineRestriction(lineRestriction) {
//     // Convert weekly capacity to daily capacity
//     if (lineRestriction.weeklyCapacity) {
//     //   lineRestriction.dailyCapacity = this.convertWeeklyToDaily(lineRestriction.weeklyCapacity);
//     lineRestriction.dailyCapacity = lineRestriction.weeklyCapacity;
//       delete lineRestriction.weeklyCapacity; // Remove weekly data
//     } else {
//       lineRestriction.dailyCapacity = this.generateDefaultDailyCapacity();
//     }
    
//     this.lineRestrictions.set(lineRestriction.restrictionName, lineRestriction);
//     this.logger.info(`Added line restriction: ${lineRestriction.restrictionName}`);
//   }

//   // NEW: Convert weekly capacity to daily capacity
//   convertWeeklyToDaily(weeklyCapacity) {
//     const dailyCapacity = {};
    
//     this.dailyBuckets.forEach(day => {
//       const weekNumber = moment(day.date).week();
//       const year = moment(day.date).year();
//       const weekKey = `W${year}-${weekNumber.toString().padStart(2, '0')}`;
      
//       // Skip weekends (optional - can be configured)
//       if (day.isWeekend) {
//         dailyCapacity[day.date] = 0;
//       } else {
//         // Distribute weekly capacity across 5 working days
//         const weeklyAmount = weeklyCapacity[weekKey] || 0;
//         dailyCapacity[day.date] = Math.floor(weeklyAmount / 5);
//       }
//     });
    
//     return dailyCapacity;
//   }

//   // NEW: Generate default daily capacity
//   generateDefaultDailyCapacity() {
//     const dailyCapacity = {};
    
//     this.dailyBuckets.forEach(day => {
//       if (day.isWeekend) {
//         dailyCapacity[day.date] = 0;
//       } else {
//         dailyCapacity[day.date] = Math.floor(Math.random() * 5) + 2; // 2-7 daily capacity
//       }
//     });
    
//     return dailyCapacity;
//   }

//   addOperation(operation) {
//     this.operations.set(operation.operationId, operation);
//     this.logger.info(`Added operation: ${operation.operationId}`);
//   }

//   addSalesOrder(salesOrder) {
//     // Validate and convert dates
//     salesOrder.orderPromiseDate = moment(salesOrder.orderPromiseDate).toDate();
    
//     // NEW: Ensure order promise date is not in the past
//     const promiseDate = moment(salesOrder.orderPromiseDate);
//     const currentDate = moment();
    
//     if (promiseDate.isBefore(currentDate)) {
//       this.logger.warn(`Order ${salesOrder.orderNumber} has promise date in the past. Adjusting to current date + ${this.minEarlyDeliveryDays} days.`);
//       salesOrder.orderPromiseDate = currentDate.clone().add(this.minEarlyDeliveryDays, 'days').toDate();
//     }
    
//     this.salesOrders.set(salesOrder.orderNumber, salesOrder);
//     this.logger.info(`Added sales order: ${salesOrder.orderNumber}`);
//   }

//   addPenaltyRule(penaltyRule) {
//     const key = `${penaltyRule.customerPriority}_${penaltyRule.productId}`;
//     this.penaltyRules.set(key, penaltyRule);
//     this.logger.info(`Added penalty rule: ${key}`);
//   }

//   addComponentAvailability(componentAvailability) {
//     // Convert weekly availability to daily if needed
//     if (componentAvailability.weeklyAvailability) {
//     //   componentAvailability.dailyAvailability = this.convertWeeklyAvailabilityToDaily(componentAvailability.weeklyAvailability);
//     componentAvailability.dailyAvailability = componentAvailability.weeklyAvailability;
//       delete componentAvailability.weeklyAvailability;
//     }
    
//     this.componentAvailability.set(componentAvailability.componentId, componentAvailability);
//     this.logger.info(`Added component availability: ${componentAvailability.componentId}`);
//   }

//   // NEW: Convert weekly component availability to daily
//   convertWeeklyAvailabilityToDaily(weeklyAvailability) {
//     const dailyAvailability = {};
    
//     this.dailyBuckets.forEach(day => {
//       const weekNumber = moment(day.date).week();
//       const year = moment(day.date).year();
//       const weekKey = `W${year}-${weekNumber.toString().padStart(2, '0')}`;
      
//       // Distribute weekly availability across 7 days
//       const weeklyAmount = weeklyAvailability[weekKey] || 0;
//       dailyAvailability[day.date] = Math.floor(weeklyAmount / 7);
//     });
    
//     return dailyAvailability;
//   }

//   addPriorityDeliveryCriteria(criteria) {
//     this.priorityDeliveryCriteria.set(criteria.customerPriority, criteria);
//     this.logger.info(`Added priority delivery criteria: ${criteria.customerPriority}`);
//   }

//   getPriorityDeliveryCriteria(customerPriority) {
//     if (this.priorityDeliveryCriteria.has(customerPriority)) {
//       return this.priorityDeliveryCriteria.get(customerPriority);
//     }

//     let maxDelayDays = 7;
//     let penaltyMultiplier = 2.0;
//     let description = 'Default criteria';

//     const priorityLower = customerPriority.toLowerCase();

//     if (priorityLower.includes('critical') || priorityLower.includes('urgent') || priorityLower.includes('emergency')) {
//       maxDelayDays = 0;
//       penaltyMultiplier = 5.0;
//       description = 'Critical priority - must be on time or early';
//     } else if (priorityLower.includes('high') || priorityLower.includes('important') || priorityLower.includes('priority')) {
//       maxDelayDays = 0;
//       penaltyMultiplier = 3.0;
//       description = 'High priority - must be on time or early';
//     } else if (priorityLower.includes('medium') || priorityLower.includes('normal') || priorityLower.includes('standard')) {
//       maxDelayDays = 7;
//       penaltyMultiplier = 2.0;
//       description = 'Medium priority - up to 1 week delay allowed';
//     } else if (priorityLower.includes('low') || priorityLower.includes('flexible') || priorityLower.includes('when possible')) {
//       maxDelayDays = 14;
//       penaltyMultiplier = 1.0;
//       description = 'Low priority - up to 2 weeks delay allowed';
//     }

//     const defaultCriteria = {
//       customerPriority: customerPriority,
//       maxDelayDays: maxDelayDays,
//       penaltyMultiplier: penaltyMultiplier,
//       description: description
//     };

//     this.priorityDeliveryCriteria.set(customerPriority, defaultCriteria);
//     return defaultCriteria;
//   }

//   isDelayAcceptableForPriority(customerPriority, delayDays) {
//     const criteria = this.getPriorityDeliveryCriteria(customerPriority);
//     return delayDays <= criteria.maxDelayDays;
//   }

//   loadSampleData() {
//     this.logger.info('Loading sample forklift manufacturing data with daily capacity...');

//     // Products (Forklifts)
//     const products = [
//       { productId: 'FL001', productName: 'Electric Forklift 2T', productDescription: '2-ton electric forklift with 3m lift height' },
//       { productId: 'FL002', productName: 'Diesel Forklift 3T', productDescription: '3-ton diesel forklift for outdoor use' },
//       { productId: 'FL003', productName: 'Electric Reach Truck', productDescription: 'Electric reach truck for warehouse operations' },
//       { productId: 'FL004', productName: 'Diesel Forklift 5T', productDescription: '5-ton heavy-duty diesel forklift' },
//       { productId: 'FL005', productName: 'Electric Pallet Jack', productDescription: 'Electric pallet jack for light operations' }
//     ];

//     products.forEach(product => this.addProduct(product));

//     // Line Restrictions with daily capacity
//     const lineRestrictions = [
//       { restrictionName: 'Assembly_A', validity: true, penaltyCost: 500.0, dailyCapacity: this.generateDefaultDailyCapacity() },
//       { restrictionName: 'Assembly_B', validity: true, penaltyCost: 600.0, dailyCapacity: this.generateDefaultDailyCapacity() },
//       { restrictionName: 'Welding_Line1', validity: true, penaltyCost: 300.0, dailyCapacity: this.generateDefaultDailyCapacity() },
//       { restrictionName: 'Welding_Line2', validity: true, penaltyCost: 350.0, dailyCapacity: this.generateDefaultDailyCapacity() },
//       { restrictionName: 'Paint_Line', validity: true, penaltyCost: 400.0, dailyCapacity: this.generateDefaultDailyCapacity() },
//       { restrictionName: 'Testing_Station', validity: true, penaltyCost: 200.0, dailyCapacity: this.generateDefaultDailyCapacity() }
//     ];

//     lineRestrictions.forEach(lr => this.addLineRestriction(lr));

//     // Operations
//     const operations = [
//       { operationId: '0010', primaryLineRestriction: 'Welding_Line1', alternateLineRestrictions: ['Welding_Line2'] },
//       { operationId: '0020', primaryLineRestriction: 'Assembly_A', alternateLineRestrictions: ['Assembly_B'] },
//       { operationId: '0030', primaryLineRestriction: 'Paint_Line', alternateLineRestrictions: [] },
//       { operationId: '0040', primaryLineRestriction: 'Testing_Station', alternateLineRestrictions: [] }
//     ];

//     operations.forEach(op => this.addOperation(op));

//     // Components with daily availability
//     const components = ['Engine', 'Chassis', 'Hydraulics', 'Electronics', 'Tires', 'Battery'];
//     components.forEach(comp => {
//       this.addComponentAvailability({
//         componentId: comp,
//         dailyAvailability: this.generateDefaultDailyAvailability()
//       });
//     });

//     // Penalty Rules
//     const priorities = ['High', 'Medium', 'Low'];
//     priorities.forEach(priority => {
//       Array.from(this.products.keys()).forEach(productId => {
//         const lateDeliveryPenalty = priority === 'High' ? 100.0 : priority === 'Medium' ? 50.0 : 25.0;
//         const noFulfillmentPenalty = priority === 'High' ? 1000.0 : priority === 'Medium' ? 500.0 : 200.0;

//         this.addPenaltyRule({
//           customerPriority: priority,
//           productId: productId,
//           lateDeliveryPenalty: lateDeliveryPenalty,
//           noFulfillmentPenalty: noFulfillmentPenalty
//         });
//       });
//     });

//     // Generate sample sales orders
//     this.generateSampleSalesOrders();

//     // Create priority delivery criteria based on actual priorities used
//     const usedPriorities = new Set();
//     for (const order of this.salesOrders.values()) {
//       usedPriorities.add(order.customerPriority);
//     }

//     for (const priority of usedPriorities) {
//       if (!this.priorityDeliveryCriteria.has(priority)) {
//         this.getPriorityDeliveryCriteria(priority);
//       }
//     }

//     this.logger.info(`Loaded ${this.salesOrders.size} sample sales orders with daily capacity planning`);
//   }

//   generateDefaultDailyAvailability() {
//     const availability = {};
//     this.dailyBuckets.forEach(day => {
//       if (day.isWeekend) {
//         availability[day.date] = 0;
//       } else {
//         availability[day.date] = Math.floor(Math.random() * 30) + 10; // 10-40 daily availability
//       }
//     });
//     return availability;
//   }

//   generateSampleSalesOrders() {
//     const orderCount = 50;
//     const productIds = Array.from(this.products.keys());
//     const priorities = ['High', 'Medium', 'Low'];

//     for (let i = 1; i <= orderCount; i++) {
//       const orderNumber = `SO${i.toString().padStart(4, '0')}`;
//       const productId = productIds[Math.floor(Math.random() * productIds.length)];

//       // Promise dates 7-84 days from planning start (never in the past)
//       const daysFromNow = Math.floor(Math.random() * 77) + 7; // 7 to 84 days
//       const promiseDate = this.planningStartDate.clone().add(daysFromNow, 'days').toDate();

//       const qty = Math.floor(Math.random() * 5) + 1;
//       const revenue = (Math.random() * 35000 + 15000) * qty;
//       const cost = revenue * (Math.random() * 0.2 + 0.6);
//       const priority = priorities[Math.floor(Math.random() * priorities.length)];

//       const operations = ['0010', '0020', '0030', '0040'];

//       const components = {
//         'Engine': qty,
//         'Chassis': qty,
//         'Hydraulics': ['FL001', 'FL003'].includes(productId) ? qty : qty * 2,
//         'Electronics': qty,
//         'Tires': qty * 4,
//         'Battery': ['FL001', 'FL003', 'FL005'].includes(productId) ? qty : 0
//       };

//       this.addSalesOrder({
//         orderNumber,
//         productId,
//         orderPromiseDate: promiseDate,
//         orderQty: qty,
//         revenue,
//         cost,
//         customerPriority: priority,
//         operations,
//         components
//       });
//     }
//   }

//   // NEW: Convert day index to date
//   dayIndexToDate(dayIndex) {
//     if (dayIndex < 0 || dayIndex >= this.dailyBuckets.length) {
//       return null;
//     }
//     return this.planningStartDate.clone().add(dayIndex, 'days');
//   }

//   // NEW: Convert date to day index
//   dateToIndexDay(date) {
//     const targetDate = moment(date);
//     const daysDiff = targetDate.diff(this.planningStartDate, 'days');
//     return Math.max(0, daysDiff);
//   }

//   toJSON() {
//     return {
//       planningStartDate: this.planningStartDate.toISOString(),
//       minEarlyDeliveryDays: this.minEarlyDeliveryDays,
//       planningHorizonDays: this.planningHorizonDays,
//       products: Object.fromEntries(this.products),
//       lineRestrictions: Object.fromEntries(this.lineRestrictions),
//       operations: Object.fromEntries(this.operations),
//       salesOrders: Object.fromEntries(this.salesOrders),
//       penaltyRules: Object.fromEntries(this.penaltyRules),
//       componentAvailability: Object.fromEntries(this.componentAvailability),
//       priorityDeliveryCriteria: Object.fromEntries(this.priorityDeliveryCriteria),
//       dailyBuckets: this.dailyBuckets,
//       currentDayIndex: this.currentDayIndex,
//       underUtilizationConfig: this.underUtilizationConfig
//     };
//   }
//   ensureDataIntegrity() {
//     // Ensure all sales orders have valid operations
//     for (const [orderNumber, order] of this.salesOrders.entries()) {
//       if (!order.operations || order.operations.length === 0) {
//         order.operations = ['DEFAULT_OP'];
//       }
      
//       // Ensure operations exist in system
//       for (const operationId of order.operations) {
//         if (!this.operations.has(operationId)) {
//           const availableLines = Array.from(this.lineRestrictions.keys());
//           this.operations.set(operationId, {
//             operationId: operationId,
//             primaryLineRestriction: availableLines[0] || 'DEFAULT_LINE',
//             alternateLineRestrictions: availableLines.slice(1) || []
//           });
//         }
//       }
//     }
    
//     // Ensure line restrictions have capacity data
//     for (const [lineName, restriction] of this.lineRestrictions.entries()) {
//       if (!restriction.weeklyCapacity || Object.keys(restriction.weeklyCapacity).length === 0) {
//         restriction.weeklyCapacity = {};
//         this.weeks.forEach(week => {
//           restriction.weeklyCapacity[week] = 10; // Default capacity
//         });
//       }
//     }
    
//     // Ensure priority criteria exist for all customer priorities
//     const usedPriorities = new Set();
//     for (const order of this.salesOrders.values()) {
//       if (order.customerPriority) {
//         usedPriorities.add(order.customerPriority);
//       }
//     }
    
//     for (const priority of usedPriorities) {
//       if (!this.priorityDeliveryCriteria.has(priority)) {
//         this.getPriorityDeliveryCriteria(priority);
//       }
//     }
//   }
// }

//New order planning system by ashok - 23/07/2025
class OrderPlanningSystemDaily {
  constructor(planningStartDate = null, minEarlyDeliveryDays = 7) {
    this.products = new Map();
    this.lineRestrictions = new Map();
    this.operations = new Map();
    this.salesOrders = new Map();
    this.penaltyRules = new Map();
    this.componentAvailability = new Map();
    this.priorityDeliveryCriteria = new Map();
    this.planningStartDate = planningStartDate ? moment(planningStartDate) : moment();
    this.minEarlyDeliveryDays = minEarlyDeliveryDays;
    
    // Enhanced daily capacity management for BTP
    this.planningHorizonDays = parseInt(process.env.PLANNING_HORIZON_DAYS) || 365;
    this.dailyBuckets = this.generateDailyBuckets();
    this.currentDayIndex = this.getCurrentDayIndex();
    
    // BTP-optimized under-utilization configuration
    this.underUtilizationConfig = {
      baseNearTermPenalty: parseFloat(process.env.BASE_NEAR_TERM_PENALTY) || 25.0,
      baseFutureTermPenalty: parseFloat(process.env.BASE_FUTURE_TERM_PENALTY) || 2.0,
      nearTermDays: parseInt(process.env.NEAR_TERM_DAYS) || 30,
      decayRate: parseFloat(process.env.DECAY_RATE) || 0.95,
      targetUtilizationRate: parseFloat(process.env.TARGET_UTILIZATION_RATE) || 0.70,
      minCapacityThreshold: parseInt(process.env.MIN_CAPACITY_THRESHOLD) || 1
    };
    
    this.logger = Logger.getInstance();
    this.logger.info('OrderPlanningSystem initialized for SAP BTP', {
      planningHorizonDays: this.planningHorizonDays,
      planningStartDate: this.planningStartDate.format('YYYY-MM-DD'),
      minEarlyDeliveryDays: this.minEarlyDeliveryDays
    });
  }

  generateDailyBuckets(numDays = null) {
    const days = [];
    const totalDays = numDays || this.planningHorizonDays;
    const baseDate = this.planningStartDate.clone();

    for (let i = 0; i < totalDays; i++) {
      const dayDate = baseDate.clone().add(i, 'days');
      days.push({
        date: dayDate.format('YYYY-MM-DD'),
        dayIndex: i,
        weekday: dayDate.format('dddd'),
        isWeekend: dayDate.day() === 0 || dayDate.day() === 6,
        weekNumber: dayDate.week(),
        yearWeek: `W${dayDate.format('YYYY-WW')}`
      });
    }

    return days;
  }

  getCurrentDayIndex() {
    const currentDate = moment();
    const daysDiff = currentDate.diff(this.planningStartDate, 'days');
    return Math.max(0, daysDiff);
  }

  getEarliestSchedulableDayIndex() {
    return Math.max(this.getCurrentDayIndex(), 0);
  }

  getEarliestSchedulableDayForOrder(orderNumber) {
    const order = this.salesOrders.get(orderNumber);
    if (!order) return this.getEarliestSchedulableDayIndex();

    const promiseDate = moment(order.orderPromiseDate);
    const earliestDeliveryDate = promiseDate.clone().subtract(this.minEarlyDeliveryDays, 'days');
    const currentDate = moment();
    const effectiveConstraintDate = moment.max(earliestDeliveryDate, this.planningStartDate, currentDate);

    const daysDiff = effectiveConstraintDate.diff(this.planningStartDate, 'days');
    return Math.max(daysDiff >= 0 ? daysDiff : this.getEarliestSchedulableDayIndex(), this.getEarliestSchedulableDayIndex());
  }

  calculateUnderUtilizationPenalty(dayIndex, actualUtilization, maxCapacity) {
    if (maxCapacity <= this.underUtilizationConfig.minCapacityThreshold) return 0;
    
    const utilizationRate = actualUtilization / maxCapacity;
    const targetRate = this.underUtilizationConfig.targetUtilizationRate;
    
    if (utilizationRate >= targetRate) return 0;
    
    const underUtilization = targetRate - utilizationRate;
    
    let penaltyMultiplier;
    if (dayIndex <= this.underUtilizationConfig.nearTermDays) {
      const daysFactor = (this.underUtilizationConfig.nearTermDays - dayIndex) / this.underUtilizationConfig.nearTermDays;
      penaltyMultiplier = this.underUtilizationConfig.baseNearTermPenalty * daysFactor;
    } else {
      const daysFromNearTerm = dayIndex - this.underUtilizationConfig.nearTermDays;
      penaltyMultiplier = this.underUtilizationConfig.baseFutureTermPenalty * 
                         Math.pow(this.underUtilizationConfig.decayRate, daysFromNearTerm / 10);
    }
    
    return underUtilization * maxCapacity * penaltyMultiplier;
  }

  addProduct(product) {
    this.products.set(product.productId, product);
    this.logger.info(`Added product: ${product.productId}`);
  }

  addLineRestriction(lineRestriction) {
    // Enhanced capacity handling for BTP environment
    if (lineRestriction.weeklyCapacity && !lineRestriction.dailyCapacity) {
      lineRestriction.dailyCapacity = this.convertWeeklyToDetailedDaily(lineRestriction.weeklyCapacity);
      delete lineRestriction.weeklyCapacity
    } else if (!lineRestriction.dailyCapacity) {
      lineRestriction.dailyCapacity = this.generateDetailedDailyCapacity();
    }
    
    this.validateDailyCapacity(lineRestriction.dailyCapacity, lineRestriction.restrictionName);
    
    this.lineRestrictions.set(lineRestriction.restrictionName, lineRestriction);
    this.logger.info(`Added line restriction: ${lineRestriction.restrictionName} with detailed daily capacity`);
  }

  convertWeeklyToDetailedDaily(weeklyCapacity) {
    const dailyCapacity = {};
    
    this.dailyBuckets.forEach(day => {
      const weekKey = day.date;
      const weeklyAmount = weeklyCapacity[weekKey] || 0;
      
      if (day.isWeekend) {
        dailyCapacity[day.date] = 0;
      } else {
        const baseDailyAmount = weeklyAmount / 5;
        const variations = [0.8, 1.2, 1.0, 0.9, 1.1]; // Monday to Friday
        const dayOfWeek = moment(day.date).day();
        const multiplier = dayOfWeek >= 1 && dayOfWeek <= 5 ? variations[dayOfWeek - 1] : 0;
        
        dailyCapacity[day.date] = Math.max(0, Math.floor(baseDailyAmount * multiplier));
      }
    });
    
    return dailyCapacity;
  }

  generateDetailedDailyCapacity() {
    const dailyCapacity = {};
    
    this.dailyBuckets.forEach(day => {
      if (day.isWeekend) {
        dailyCapacity[day.date] = 0;
      } else {
        const random = Math.random();
        
        if (random < 0.05) {
          dailyCapacity[day.date] = 0; // Maintenance days
        } else if (random < 0.15) {
          dailyCapacity[day.date] = Math.floor(Math.random() * 3) + 1; // Reduced capacity
        } else {
          dailyCapacity[day.date] = Math.floor(Math.random() * 5) + 3; // Normal capacity
        }
      }
    });
    
    return dailyCapacity;
  }

  validateDailyCapacity(dailyCapacity, restrictionName) {
    let zeroCapacityDays = 0;
    let totalDays = 0;
    
    for (const day of this.dailyBuckets.slice(0, 30)) {
      const capacity = dailyCapacity[day.date];
      if (capacity === undefined) {
        this.logger.warn(`Missing capacity for day ${day.date} in restriction ${restrictionName}`);
      } else if (capacity === 0) {
        zeroCapacityDays++;
      }
      totalDays++;
    }
    
    this.logger.info(`Restriction ${restrictionName}: ${zeroCapacityDays}/${totalDays} days have 0 capacity in next 30 days`);
  }

  addOperation(operation) {
    this.operations.set(operation.operationId, operation);
    this.logger.info(`Added operation: ${operation.operationId}`);
  }

  addSalesOrder(salesOrder) {
    salesOrder.orderPromiseDate = moment(salesOrder.orderPromiseDate).toDate();
    
    const promiseDate = moment(salesOrder.orderPromiseDate);
    const currentDate = moment();
    
    if (promiseDate.isBefore(currentDate)) {
      this.logger.warn(`Order ${salesOrder.orderNumber} has promise date in the past. Adjusting to current date + ${this.minEarlyDeliveryDays} days.`);
      salesOrder.orderPromiseDate = currentDate.clone().add(this.minEarlyDeliveryDays, 'days').toDate();
    }
    
    this.salesOrders.set(salesOrder.orderNumber, salesOrder);
    this.logger.info(`Added sales order: ${salesOrder.orderNumber}`);
  }

  addPenaltyRule(penaltyRule) {
    const key = `${penaltyRule.customerPriority}_${penaltyRule.productId}`;
    this.penaltyRules.set(key, penaltyRule);
    this.logger.info(`Added penalty rule: ${key}`);
  }

  addComponentAvailability(componentAvailability) {
    if (componentAvailability.weeklyAvailability && !componentAvailability.dailyAvailability) {
      componentAvailability.dailyAvailability = this.convertWeeklyAvailabilityToDaily(componentAvailability.weeklyAvailability);
      delete componentAvailability.weeklyAvailability;
    }
    
    this.componentAvailability.set(componentAvailability.componentId, componentAvailability);
    this.logger.info(`Added component availability: ${componentAvailability.componentId}`);
  }

  convertWeeklyAvailabilityToDaily(weeklyAvailability) {
    const dailyAvailability = {};
    
    this.dailyBuckets.forEach(day => {
      const weekKey = day.date;
      const weeklyAmount = weeklyAvailability[weekKey] || 0;
      dailyAvailability[day.date] = Math.floor(weeklyAmount / 7);
    });
    
    return dailyAvailability;
  }

  addPriorityDeliveryCriteria(criteria) {
    this.priorityDeliveryCriteria.set(criteria.customerPriority, criteria);
    this.logger.info(`Added priority delivery criteria: ${criteria.customerPriority}`);
  }

  getPriorityDeliveryCriteria(customerPriority) {
    if (this.priorityDeliveryCriteria.has(customerPriority)) {
      return this.priorityDeliveryCriteria.get(customerPriority);
    }

    let maxDelayDays = 7;
    let penaltyMultiplier = 2.0;
    let description = 'Default criteria';

    const priorityLower = customerPriority.toLowerCase();

    if (priorityLower.includes('critical') || priorityLower.includes('urgent') || priorityLower.includes('emergency')) {
      maxDelayDays = 0;
      penaltyMultiplier = 5.0;
      description = 'Critical priority - must be on time or early';
    } else if (priorityLower.includes('high') || priorityLower.includes('important') || priorityLower.includes('priority')) {
      maxDelayDays = 0;
      penaltyMultiplier = 3.0;
      description = 'High priority - must be on time or early';
    } else if (priorityLower.includes('medium') || priorityLower.includes('normal') || priorityLower.includes('standard')) {
      maxDelayDays = 7;
      penaltyMultiplier = 2.0;
      description = 'Medium priority - up to 1 week delay allowed';
    } else if (priorityLower.includes('low') || priorityLower.includes('flexible') || priorityLower.includes('when possible')) {
      maxDelayDays = 14;
      penaltyMultiplier = 1.0;
      description = 'Low priority - up to 2 weeks delay allowed';
    }

    const defaultCriteria = {
      customerPriority: customerPriority,
      maxDelayDays: maxDelayDays,
      penaltyMultiplier: penaltyMultiplier,
      description: description
    };

    this.priorityDeliveryCriteria.set(customerPriority, defaultCriteria);
    return defaultCriteria;
  }

  isDelayAcceptableForPriority(customerPriority, delayDays) {
    const criteria = this.getPriorityDeliveryCriteria(customerPriority);
    return delayDays <= criteria.maxDelayDays;
  }

  loadSampleData() {
    this.logger.info('Loading sample forklift manufacturing data with detailed daily capacity for BTP...');

    // Products
    const products = [
      { productId: 'FL001', productName: 'Electric Forklift 2T', productDescription: '2-ton electric forklift with 3m lift height' },
      { productId: 'FL002', productName: 'Diesel Forklift 3T', productDescription: '3-ton diesel forklift for outdoor use' },
      { productId: 'FL003', productName: 'Electric Reach Truck', productDescription: 'Electric reach truck for warehouse operations' },
      { productId: 'FL004', productName: 'Diesel Forklift 5T', productDescription: '5-ton heavy-duty diesel forklift' },
      { productId: 'FL005', productName: 'Electric Pallet Jack', productDescription: 'Electric pallet jack for light operations' }
    ];

    products.forEach(product => this.addProduct(product));

    // Line Restrictions with detailed daily capacity
    const lineRestrictions = [
      { restrictionName: 'Assembly_A', validity: true, penaltyCost: 500.0 },
      { restrictionName: 'Assembly_B', validity: true, penaltyCost: 600.0 },
      { restrictionName: 'Welding_Line1', validity: true, penaltyCost: 300.0 },
      { restrictionName: 'Welding_Line2', validity: true, penaltyCost: 350.0 },
      { restrictionName: 'Paint_Line', validity: true, penaltyCost: 400.0 },
      { restrictionName: 'Testing_Station', validity: true, penaltyCost: 200.0 }
    ];

    lineRestrictions.forEach(lr => this.addLineRestriction(lr));

    // Operations
    const operations = [
      { operationId: '0010', primaryLineRestriction: 'Welding_Line1', alternateLineRestrictions: ['Welding_Line2'] },
      { operationId: '0020', primaryLineRestriction: 'Assembly_A', alternateLineRestrictions: ['Assembly_B'] },
      { operationId: '0030', primaryLineRestriction: 'Paint_Line', alternateLineRestrictions: [] },
      { operationId: '0040', primaryLineRestriction: 'Testing_Station', alternateLineRestrictions: [] }
    ];

    operations.forEach(op => this.addOperation(op));

    // Components
    const components = ['Engine', 'Chassis', 'Hydraulics', 'Electronics', 'Tires', 'Battery'];
    components.forEach(comp => {
      this.addComponentAvailability({
        componentId: comp,
        dailyAvailability: this.generateRealisticComponentAvailability()
      });
    });

    // Penalty Rules
    const priorities = ['High', 'Medium', 'Low'];
    priorities.forEach(priority => {
      Array.from(this.products.keys()).forEach(productId => {
        const lateDeliveryPenalty = priority === 'High' ? 100.0 : priority === 'Medium' ? 50.0 : 25.0;
        const noFulfillmentPenalty = priority === 'High' ? 1000.0 : priority === 'Medium' ? 500.0 : 200.0;

        this.addPenaltyRule({
          customerPriority: priority,
          productId: productId,
          lateDeliveryPenalty: lateDeliveryPenalty,
          noFulfillmentPenalty: noFulfillmentPenalty
        });
      });
    });

    this.generateSampleSalesOrders();

    // Create priority delivery criteria
    const usedPriorities = new Set();
    for (const order of this.salesOrders.values()) {
      usedPriorities.add(order.customerPriority);
    }

    for (const priority of usedPriorities) {
      if (!this.priorityDeliveryCriteria.has(priority)) {
        this.getPriorityDeliveryCriteria(priority);
      }
    }

    this.logger.info(`Loaded ${this.salesOrders.size} sample sales orders with detailed daily capacity planning for BTP`);
  }

  generateRealisticComponentAvailability() {
    const availability = {};
    this.dailyBuckets.forEach(day => {
      if (day.isWeekend) {
        availability[day.date] = 0;
      } else {
        const random = Math.random();
        if (random < 0.1) {
          availability[day.date] = 0; // 10% chance of no availability
        } else {
          availability[day.date] = Math.floor(Math.random() * 30) + 10; // 10-40
        }
      }
    });
    return availability;
  }

  generateSampleSalesOrders() {
    const orderCount = parseInt(process.env.SAMPLE_ORDER_COUNT) || 50;
    const productIds = Array.from(this.products.keys());
    const priorities = ['High', 'Medium', 'Low'];

    for (let i = 1; i <= orderCount; i++) {
      const orderNumber = `SO${i.toString().padStart(4, '0')}`;
      const productId = productIds[Math.floor(Math.random() * productIds.length)];

      const daysFromNow = Math.floor(Math.random() * 77) + 7;
      const promiseDate = this.planningStartDate.clone().add(daysFromNow, 'days').toDate();

      const qty = Math.floor(Math.random() * 5) + 1;
      const revenue = (Math.random() * 35000 + 15000) * qty;
      const cost = revenue * (Math.random() * 0.2 + 0.6);
      const priority = priorities[Math.floor(Math.random() * priorities.length)];

      const operations = ['0010', '0020', '0030', '0040'];

      const components = {
        'Engine': qty,
        'Chassis': qty,
        'Hydraulics': ['FL001', 'FL003'].includes(productId) ? qty : qty * 2,
        'Electronics': qty,
        'Tires': qty * 4,
        'Battery': ['FL001', 'FL003', 'FL005'].includes(productId) ? qty : 0
      };

      this.addSalesOrder({
        orderNumber,
        productId,
        orderPromiseDate: promiseDate,
        orderQty: qty,
        revenue,
        cost,
        customerPriority: priority,
        operations,
        components
      });
    }
  }

  getActualCapacityForDate(lineRestriction, date) {
    const restriction = this.lineRestrictions.get(lineRestriction);
    if (!restriction || !restriction.dailyCapacity) return 0;
    return restriction.dailyCapacity[date] || 0;
  }

  hasCapacityOnDate(lineRestriction, date) {
    return this.getActualCapacityForDate(lineRestriction, date) > 0;
  }

  dayIndexToDate(dayIndex) {
    if (dayIndex < 0 || dayIndex >= this.dailyBuckets.length) {
      return null;
    }
    return this.planningStartDate.clone().add(dayIndex, 'days');
  }

  dateToIndexDay(date) {
    const targetDate = moment(date);
    const daysDiff = targetDate.diff(this.planningStartDate, 'days');
    return Math.max(0, daysDiff);
  }

  toJSON() {
    return {
      planningStartDate: this.planningStartDate.toISOString(),
      minEarlyDeliveryDays: this.minEarlyDeliveryDays,
      planningHorizonDays: this.planningHorizonDays,
      products: Object.fromEntries(this.products),
      lineRestrictions: Object.fromEntries(this.lineRestrictions),
      operations: Object.fromEntries(this.operations),
      salesOrders: Object.fromEntries(this.salesOrders),
      penaltyRules: Object.fromEntries(this.penaltyRules),
      componentAvailability: Object.fromEntries(this.componentAvailability),
      priorityDeliveryCriteria: Object.fromEntries(this.priorityDeliveryCriteria),
      dailyBuckets: this.dailyBuckets,
      currentDayIndex: this.currentDayIndex,
      underUtilizationConfig: this.underUtilizationConfig
    };
  }

  /**
   * Validates if the system has sufficient capacity to proceed with optimization
   * @returns {Object} validation result with status and details
   */
  validateCapacityForOptimization() {
    const validationResult = {
      isValid: true,
      issues: [],
      criticalIssues: [],
      totalLines: 0,
      zeroCapacityLines: 0,
      nullCapacityLines: 0,
      hasAnyValidCapacity: false
    };

    // Check each line restriction
    for (const [lineName, restriction] of this.lineRestrictions.entries()) {
      validationResult.totalLines++;
      
      if (!restriction.dailyCapacity || Object.keys(restriction.dailyCapacity).length === 0) {
        validationResult.nullCapacityLines++;
        validationResult.criticalIssues.push(`Line '${lineName}' has no capacity data`);
        continue;
      }

      // Check if all weeks have zero or null capacity
      const capacityValues = Object.values(restriction.dailyCapacity);
      const hasAnyPositiveCapacity = capacityValues.some(capacity => {
        const cap = parseInt(capacity);
        return !isNaN(cap) && cap > 0;
      });

      if (!hasAnyPositiveCapacity) {
        validationResult.zeroCapacityLines++;
        validationResult.criticalIssues.push(`Line '${lineName}' has zero capacity for all weeks`);
      } else {
        validationResult.hasAnyValidCapacity = true;
        
        // Check for individual zero capacity weeks
        const zeroWeeks = [];
        for (const [week, capacity] of Object.entries(restriction.dailyCapacity)) {
          const cap = parseInt(capacity);
          if (isNaN(cap) || cap <= 0) {
            zeroWeeks.push(week);
          }
        }
        
        if (zeroWeeks.length > 0) {
          validationResult.issues.push(`Line '${lineName}' has zero capacity in weeks: ${zeroWeeks.join(', ')}`);
        }
      }
    }

    // Determine if optimization should proceed
    if (validationResult.totalLines === 0) {
      validationResult.isValid = false;
      validationResult.criticalIssues.push('No line restrictions defined');
    } else if (!validationResult.hasAnyValidCapacity) {
      validationResult.isValid = false;
      validationResult.criticalIssues.push('No lines have any positive capacity - optimization cannot proceed');
    } else if (validationResult.zeroCapacityLines + validationResult.nullCapacityLines === validationResult.totalLines) {
      validationResult.isValid = false;
      validationResult.criticalIssues.push('All lines have zero or null capacity - optimization cannot proceed');
    }

    return validationResult;
  }

  /**
   * Get a summary of capacity issues for logging/display
   */
  getCapacityValidationSummary() {
    const validation = this.validateCapacityForOptimization();
    
    return {
      canOptimize: validation.isValid,
      summary: `Lines: ${validation.totalLines}, Valid: ${validation.totalLines - validation.zeroCapacityLines - validation.nullCapacityLines}, Zero: ${validation.zeroCapacityLines}, Null: ${validation.nullCapacityLines}`,
      issues: validation.issues,
      criticalIssues: validation.criticalIssues
    };
  }
}

module.exports = OrderPlanningSystemDaily;