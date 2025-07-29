
// ./core/OrderPlanningSystem.js
const moment = require('moment');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Logger = require(path.resolve(__dirname, '../utils/Logger'));

class OrderPlanningSystem {
  constructor(planningStartDate = null, minEarlyDeliveryDays = 7) {
    this.products = new Map();
    this.lineRestrictions = new Map();
    this.operations = new Map();
    this.salesOrders = new Map();
    this.penaltyRules = new Map();
    this.componentAvailability = new Map();
    //New Code Change on 23/06/2025- Pradeep
    this.priorityDeliveryCriteria = new Map();
    //New Code Change on 23/06/2025- Pradeep
    this.planningStartDate = planningStartDate ? moment(planningStartDate) : moment();
    this.minEarlyDeliveryDays = minEarlyDeliveryDays;
    this.weeks = this.generateWeeks();
    this.currentWeekIndex = this.getCurrentWeekIndex();
    this.logger = Logger.getInstance();
  }

  generateWeeks(numWeeks = 52) {
    const weeks = [];
    const baseDate = this.planningStartDate.clone();

    for (let i = 0; i < numWeeks; i++) {
      const weekStart = baseDate.clone().add(i, 'weeks');
      weeks.push(`W${weekStart.format('YYYY-WW')}`);
    }

    return weeks;
  }

  getCurrentWeekIndex() {
    const currentWeek = `W${this.planningStartDate.format('YYYY-WW')}`;
    const index = this.weeks.indexOf(currentWeek);
    return Math.max(0, index);
  }

  getEarliestSchedulableWeekIndex() {
    return this.currentWeekIndex;
  }

  getEarliestSchedulableWeekForOrder(orderNumber) {
    const order = this.salesOrders.get(orderNumber);
    if (!order) return this.currentWeekIndex;

    const promiseDate = moment(order.orderPromiseDate);
    const earliestDeliveryDate = promiseDate.clone().subtract(this.minEarlyDeliveryDays, 'days');
    const constraintDate = moment.max(earliestDeliveryDate, this.planningStartDate);

    const earliestWeek = `W${constraintDate.format('YYYY-WW')}`;
    const weekIndex = this.weeks.indexOf(earliestWeek);

    return Math.max(weekIndex >= 0 ? weekIndex : this.currentWeekIndex, this.currentWeekIndex);
  }

  addProduct(product) {
    this.products.set(product.productId, product);
    this.logger.info(`Added product: ${product.productId}`);
  }

  addLineRestriction(lineRestriction) {
    this.lineRestrictions.set(lineRestriction.restrictionName, lineRestriction);
    this.logger.info(`Added line restriction: ${lineRestriction.restrictionName}`);
  }

  addOperation(operation) {
    this.operations.set(operation.operationId, operation);
    this.logger.info(`Added operation: ${operation.operationId}`);
  }

  addSalesOrder(salesOrder) {
    // Validate and convert dates
    salesOrder.orderPromiseDate = moment(salesOrder.orderPromiseDate).toDate();
    this.salesOrders.set(salesOrder.orderNumber, salesOrder);
    this.logger.info(`Added sales order: ${salesOrder.orderNumber}`);
  }

  addPenaltyRule(penaltyRule) {
    const key = `${penaltyRule.customerPriority}_${penaltyRule.productId}`;
    this.penaltyRules.set(key, penaltyRule);
    this.logger.info(`Added penalty rule: ${key}`);
  }

  addComponentAvailability(componentAvailability) {
    this.componentAvailability.set(componentAvailability.componentId, componentAvailability);
    this.logger.info(`Added component availability: ${componentAvailability.componentId}`);
  }

  //New code addition 23/06/2025- Pradeep
  addPriorityDeliveryCriteria(criteria) {
    this.priorityDeliveryCriteria.set(criteria.customerPriority, criteria);
    this.logger.info(`Added priority delivery criteria: ${criteria.customerPriority}`);
  }

  // getPriorityDeliveryCriteria(customerPriority) {
  //   return this.priorityDeliveryCriteria.get(customerPriority) || {
  //     customerPriority: customerPriority,
  //     maxDelayDays: 7,
  //     penaltyMultiplier: 2.0,
  //     description: 'Default criteria'
  //   };
  // }
  //New code replacing above function version4 25/06/2025
  getPriorityDeliveryCriteria(customerPriority) {
    // First check if criteria exists
    if (this.priorityDeliveryCriteria.has(customerPriority)) {
      return this.priorityDeliveryCriteria.get(customerPriority);
    }

    // Create dynamic default based on priority name analysis
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

    // Cache the default for future use
    this.priorityDeliveryCriteria.set(customerPriority, defaultCriteria);

    return defaultCriteria;
  }

  isDelayAcceptableForPriority(customerPriority, delayDays) {
    const criteria = this.getPriorityDeliveryCriteria(customerPriority);
    return delayDays <= criteria.maxDelayDays;
  }
  //New code addition 23/06/2025- Pradeep

  loadSampleData() {
    this.logger.info('Loading sample forklift manufacturing data...');

    // Products (Forklifts)
    const products = [
      { productId: 'FL001', productName: 'Electric Forklift 2T', productDescription: '2-ton electric forklift with 3m lift height' },
      { productId: 'FL002', productName: 'Diesel Forklift 3T', productDescription: '3-ton diesel forklift for outdoor use' },
      { productId: 'FL003', productName: 'Electric Reach Truck', productDescription: 'Electric reach truck for warehouse operations' },
      { productId: 'FL004', productName: 'Diesel Forklift 5T', productDescription: '5-ton heavy-duty diesel forklift' },
      { productId: 'FL005', productName: 'Electric Pallet Jack', productDescription: 'Electric pallet jack for light operations' }
    ];

    products.forEach(product => this.addProduct(product));

    // Line Restrictions
    const lineRestrictions = [
      { restrictionName: 'Assembly_A', validity: true, penaltyCost: 500.0, weeklyCapacity: this.generateRandomCapacity() },
      { restrictionName: 'Assembly_B', validity: true, penaltyCost: 600.0, weeklyCapacity: this.generateRandomCapacity() },
      { restrictionName: 'Welding_Line1', validity: true, penaltyCost: 300.0, weeklyCapacity: this.generateRandomCapacity() },
      { restrictionName: 'Welding_Line2', validity: true, penaltyCost: 350.0, weeklyCapacity: this.generateRandomCapacity() },
      { restrictionName: 'Paint_Line', validity: true, penaltyCost: 400.0, weeklyCapacity: this.generateRandomCapacity() },
      { restrictionName: 'Testing_Station', validity: true, penaltyCost: 200.0, weeklyCapacity: this.generateRandomCapacity() }
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
        weeklyAvailability: this.generateRandomAvailability()
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

    //New code addition 23/06/2025- Pradeep
    // Priority Delivery Criteria
    // const priorityCriteria = [
    //   { customerPriority: 'Critical', maxDelayDays: 0, penaltyMultiplier: 5.0, description: 'Must be on time or early' },
    //   { customerPriority: 'High', maxDelayDays: 0, penaltyMultiplier: 3.0, description: 'Must be on time or early' },
    //   { customerPriority: 'Medium', maxDelayDays: 7, penaltyMultiplier: 2.0, description: 'Up to 1 week delay allowed' },
    //   { customerPriority: 'Low', maxDelayDays: 14, penaltyMultiplier: 1.0, description: 'Up to 2 weeks delay allowed' }
    // ];
    // priorityCriteria.forEach(criteria => this.addPriorityDeliveryCriteria(criteria));

    // Generate sample sales orders
    this.generateSampleSalesOrders();
    //New code added version4 25/06/2025
    // Create priority delivery criteria based on actual priorities used
    const usedPriorities = new Set();
    for (const order of this.salesOrders.values()) {
      usedPriorities.add(order.customerPriority);
    }

    // Create criteria for each priority found
    for (const priority of usedPriorities) {
      if (!this.priorityDeliveryCriteria.has(priority)) {
        // This will create appropriate default criteria
        this.getPriorityDeliveryCriteria(priority);
      }
    }

    this.logger.info(`Loaded ${this.salesOrders.size} sample sales orders`);
  }

  generateRandomCapacity() {
    const capacity = {};
    this.weeks.forEach(week => {
      capacity[week] = Math.floor(Math.random() * 15) + 5; // 5-20 capacity
    });
    return capacity;
  }

  generateRandomAvailability() {
    const availability = {};
    this.weeks.forEach(week => {
      availability[week] = Math.floor(Math.random() * 150) + 50; // 50-200 availability
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

      // Promise dates 1-12 weeks from planning start
      const weeksFromNow = Math.floor(Math.random() * 12) + 1;
      const promiseDate = this.planningStartDate.clone().add(weeksFromNow, 'weeks').toDate();

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

  toJSON() {
    return {
      planningStartDate: this.planningStartDate.toISOString(),
      minEarlyDeliveryDays: this.minEarlyDeliveryDays,
      products: Object.fromEntries(this.products),
      lineRestrictions: Object.fromEntries(this.lineRestrictions),
      operations: Object.fromEntries(this.operations),
      salesOrders: Object.fromEntries(this.salesOrders),
      penaltyRules: Object.fromEntries(this.penaltyRules),
      componentAvailability: Object.fromEntries(this.componentAvailability),
      priorityDeliveryCriteria: Object.fromEntries(this.priorityDeliveryCriteria),//New line added 23/06/2025-Pradeep
      weeks: this.weeks,
      currentWeekIndex: this.currentWeekIndex
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
      
      if (!restriction.weeklyCapacity || Object.keys(restriction.weeklyCapacity).length === 0) {
        validationResult.nullCapacityLines++;
        validationResult.criticalIssues.push(`Line '${lineName}' has no capacity data`);
        continue;
      }

      // Check if all weeks have zero or null capacity
      const capacityValues = Object.values(restriction.weeklyCapacity);
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
        for (const [week, capacity] of Object.entries(restriction.weeklyCapacity)) {
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
module.exports = OrderPlanningSystem;