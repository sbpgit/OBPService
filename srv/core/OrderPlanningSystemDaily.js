const moment = require('moment');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Logger = require(path.resolve(__dirname, '../utils/Logger'));

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
    
    // NEW: Daily buckets instead of weekly
    this.planningHorizonDays = 365; // 1 year planning horizon
    this.dailyBuckets = this.generateDailyBuckets();
    this.currentDayIndex = this.getCurrentDayIndex();
    
    // NEW: Under-utilization penalty configuration
    this.underUtilizationConfig = {
      baseNearTermPenalty: 50.0,    // High penalty for near-term under-utilization
      baseFutureTermPenalty: 5.0,   // Low penalty for future under-utilization
      nearTermDays: 30,             // Days considered "near-term"
      decayRate: 0.95,              // Exponential decay rate
      targetUtilizationRate: 0.75   // Target 75% capacity utilization
    };
    
    this.logger = Logger.getInstance();
  }

  // NEW: Generate daily buckets instead of weekly
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
        isWeekend: dayDate.day() === 0 || dayDate.day() === 6
      });
    }

    return days;
  }

  getCurrentDayIndex() {
    const currentDate = moment().format('YYYY-MM-DD');
    const planningStartDateStr = this.planningStartDate.format('YYYY-MM-DD');
    
    if (currentDate < planningStartDateStr) {
      return 0; // Current date is before planning start
    }
    
    const daysDiff = moment(currentDate).diff(this.planningStartDate, 'days');
    return Math.max(0, daysDiff);
  }

  getEarliestSchedulableDayIndex() {
    // Never allow scheduling in the past
    return Math.max(this.getCurrentDayIndex(), 0);
  }

  getEarliestSchedulableDayForOrder(orderNumber) {
    const order = this.salesOrders.get(orderNumber);
    if (!order) return this.getEarliestSchedulableDayIndex();

    const promiseDate = moment(order.orderPromiseDate);
    const earliestDeliveryDate = promiseDate.clone().subtract(this.minEarlyDeliveryDays, 'days');
    const constraintDate = moment.max(earliestDeliveryDate, this.planningStartDate);
    
    // Ensure we never schedule in the past
    const currentDate = moment();
    const effectiveConstraintDate = moment.max(constraintDate, currentDate);

    const daysDiff = effectiveConstraintDate.diff(this.planningStartDate, 'days');
    return Math.max(daysDiff >= 0 ? daysDiff : this.getEarliestSchedulableDayIndex(), this.getEarliestSchedulableDayIndex());
  }

  // NEW: Calculate under-utilization penalty for a specific day
  calculateUnderUtilizationPenalty(dayIndex, actualUtilization, maxCapacity) {
    if (maxCapacity === 0) return 0;
    
    const utilizationRate = actualUtilization / maxCapacity;
    const targetRate = this.underUtilizationConfig.targetUtilizationRate;
    
    if (utilizationRate >= targetRate) return 0; // No penalty if above target
    
    const underUtilization = targetRate - utilizationRate;
    
    // Calculate distance-based penalty decay
    let penaltyMultiplier;
    if (dayIndex <= this.underUtilizationConfig.nearTermDays) {
      // Near-term: high penalty with linear decay
      const daysFactor = (this.underUtilizationConfig.nearTermDays - dayIndex) / this.underUtilizationConfig.nearTermDays;
      penaltyMultiplier = this.underUtilizationConfig.baseNearTermPenalty * daysFactor;
    } else {
      // Future-term: exponential decay
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
    // Convert weekly capacity to daily capacity
    if (lineRestriction.weeklyCapacity) {
    //   lineRestriction.dailyCapacity = this.convertWeeklyToDaily(lineRestriction.weeklyCapacity);
    lineRestriction.dailyCapacity = lineRestriction.weeklyCapacity;
      delete lineRestriction.weeklyCapacity; // Remove weekly data
    } else {
      lineRestriction.dailyCapacity = this.generateDefaultDailyCapacity();
    }
    
    this.lineRestrictions.set(lineRestriction.restrictionName, lineRestriction);
    this.logger.info(`Added line restriction: ${lineRestriction.restrictionName}`);
  }

  // NEW: Convert weekly capacity to daily capacity
  convertWeeklyToDaily(weeklyCapacity) {
    const dailyCapacity = {};
    
    this.dailyBuckets.forEach(day => {
      const weekNumber = moment(day.date).week();
      const year = moment(day.date).year();
      const weekKey = `W${year}-${weekNumber.toString().padStart(2, '0')}`;
      
      // Skip weekends (optional - can be configured)
      if (day.isWeekend) {
        dailyCapacity[day.date] = 0;
      } else {
        // Distribute weekly capacity across 5 working days
        const weeklyAmount = weeklyCapacity[weekKey] || 0;
        dailyCapacity[day.date] = Math.floor(weeklyAmount / 5);
      }
    });
    
    return dailyCapacity;
  }

  // NEW: Generate default daily capacity
  generateDefaultDailyCapacity() {
    const dailyCapacity = {};
    
    this.dailyBuckets.forEach(day => {
      if (day.isWeekend) {
        dailyCapacity[day.date] = 0;
      } else {
        dailyCapacity[day.date] = Math.floor(Math.random() * 5) + 2; // 2-7 daily capacity
      }
    });
    
    return dailyCapacity;
  }

  addOperation(operation) {
    this.operations.set(operation.operationId, operation);
    this.logger.info(`Added operation: ${operation.operationId}`);
  }

  addSalesOrder(salesOrder) {
    // Validate and convert dates
    salesOrder.orderPromiseDate = moment(salesOrder.orderPromiseDate).toDate();
    
    // NEW: Ensure order promise date is not in the past
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
    // Convert weekly availability to daily if needed
    if (componentAvailability.weeklyAvailability) {
    //   componentAvailability.dailyAvailability = this.convertWeeklyAvailabilityToDaily(componentAvailability.weeklyAvailability);
    componentAvailability.dailyAvailability = componentAvailability.weeklyAvailability;
      delete componentAvailability.weeklyAvailability;
    }
    
    this.componentAvailability.set(componentAvailability.componentId, componentAvailability);
    this.logger.info(`Added component availability: ${componentAvailability.componentId}`);
  }

  // NEW: Convert weekly component availability to daily
  convertWeeklyAvailabilityToDaily(weeklyAvailability) {
    const dailyAvailability = {};
    
    this.dailyBuckets.forEach(day => {
      const weekNumber = moment(day.date).week();
      const year = moment(day.date).year();
      const weekKey = `W${year}-${weekNumber.toString().padStart(2, '0')}`;
      
      // Distribute weekly availability across 7 days
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
    this.logger.info('Loading sample forklift manufacturing data with daily capacity...');

    // Products (Forklifts)
    const products = [
      { productId: 'FL001', productName: 'Electric Forklift 2T', productDescription: '2-ton electric forklift with 3m lift height' },
      { productId: 'FL002', productName: 'Diesel Forklift 3T', productDescription: '3-ton diesel forklift for outdoor use' },
      { productId: 'FL003', productName: 'Electric Reach Truck', productDescription: 'Electric reach truck for warehouse operations' },
      { productId: 'FL004', productName: 'Diesel Forklift 5T', productDescription: '5-ton heavy-duty diesel forklift' },
      { productId: 'FL005', productName: 'Electric Pallet Jack', productDescription: 'Electric pallet jack for light operations' }
    ];

    products.forEach(product => this.addProduct(product));

    // Line Restrictions with daily capacity
    const lineRestrictions = [
      { restrictionName: 'Assembly_A', validity: true, penaltyCost: 500.0, dailyCapacity: this.generateDefaultDailyCapacity() },
      { restrictionName: 'Assembly_B', validity: true, penaltyCost: 600.0, dailyCapacity: this.generateDefaultDailyCapacity() },
      { restrictionName: 'Welding_Line1', validity: true, penaltyCost: 300.0, dailyCapacity: this.generateDefaultDailyCapacity() },
      { restrictionName: 'Welding_Line2', validity: true, penaltyCost: 350.0, dailyCapacity: this.generateDefaultDailyCapacity() },
      { restrictionName: 'Paint_Line', validity: true, penaltyCost: 400.0, dailyCapacity: this.generateDefaultDailyCapacity() },
      { restrictionName: 'Testing_Station', validity: true, penaltyCost: 200.0, dailyCapacity: this.generateDefaultDailyCapacity() }
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

    // Components with daily availability
    const components = ['Engine', 'Chassis', 'Hydraulics', 'Electronics', 'Tires', 'Battery'];
    components.forEach(comp => {
      this.addComponentAvailability({
        componentId: comp,
        dailyAvailability: this.generateDefaultDailyAvailability()
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

    // Generate sample sales orders
    this.generateSampleSalesOrders();

    // Create priority delivery criteria based on actual priorities used
    const usedPriorities = new Set();
    for (const order of this.salesOrders.values()) {
      usedPriorities.add(order.customerPriority);
    }

    for (const priority of usedPriorities) {
      if (!this.priorityDeliveryCriteria.has(priority)) {
        this.getPriorityDeliveryCriteria(priority);
      }
    }

    this.logger.info(`Loaded ${this.salesOrders.size} sample sales orders with daily capacity planning`);
  }

  generateDefaultDailyAvailability() {
    const availability = {};
    this.dailyBuckets.forEach(day => {
      if (day.isWeekend) {
        availability[day.date] = 0;
      } else {
        availability[day.date] = Math.floor(Math.random() * 30) + 10; // 10-40 daily availability
      }
    });
    return availability;
  }

  generateSampleSalesOrders() {
    const orderCount = 50;
    const productIds = Array.from(this.products.keys());
    const priorities = ['High', 'Medium', 'Low'];

    for (let i = 1; i <= orderCount; i++) {
      const orderNumber = `SO${i.toString().padStart(4, '0')}`;
      const productId = productIds[Math.floor(Math.random() * productIds.length)];

      // Promise dates 7-84 days from planning start (never in the past)
      const daysFromNow = Math.floor(Math.random() * 77) + 7; // 7 to 84 days
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

  // NEW: Convert day index to date
  dayIndexToDate(dayIndex) {
    if (dayIndex < 0 || dayIndex >= this.dailyBuckets.length) {
      return null;
    }
    return this.planningStartDate.clone().add(dayIndex, 'days');
  }

  // NEW: Convert date to day index
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
  ensureDataIntegrity() {
    // Ensure all sales orders have valid operations
    for (const [orderNumber, order] of this.salesOrders.entries()) {
      if (!order.operations || order.operations.length === 0) {
        order.operations = ['DEFAULT_OP'];
      }
      
      // Ensure operations exist in system
      for (const operationId of order.operations) {
        if (!this.operations.has(operationId)) {
          const availableLines = Array.from(this.lineRestrictions.keys());
          this.operations.set(operationId, {
            operationId: operationId,
            primaryLineRestriction: availableLines[0] || 'DEFAULT_LINE',
            alternateLineRestrictions: availableLines.slice(1) || []
          });
        }
      }
    }
    
    // Ensure line restrictions have capacity data
    for (const [lineName, restriction] of this.lineRestrictions.entries()) {
      if (!restriction.weeklyCapacity || Object.keys(restriction.weeklyCapacity).length === 0) {
        restriction.weeklyCapacity = {};
        this.weeks.forEach(week => {
          restriction.weeklyCapacity[week] = 10; // Default capacity
        });
      }
    }
    
    // Ensure priority criteria exist for all customer priorities
    const usedPriorities = new Set();
    for (const order of this.salesOrders.values()) {
      if (order.customerPriority) {
        usedPriorities.add(order.customerPriority);
      }
    }
    
    for (const priority of usedPriorities) {
      if (!this.priorityDeliveryCriteria.has(priority)) {
        this.getPriorityDeliveryCriteria(priority);
      }
    }
  }
}

module.exports = OrderPlanningSystemDaily;