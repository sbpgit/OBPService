
// ./core/OrderPlanningSystem.js
const moment = require('moment');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Logger = require(path.resolve(__dirname,'../utils/Logger'));

class OrderPlanningSystem {
  constructor(planningStartDate = null, minEarlyDeliveryDays = 7) {
    this.products = new Map();
    this.lineRestrictions = new Map();
    this.operations = new Map();
    this.salesOrders = new Map();
    this.penaltyRules = new Map();
    this.componentAvailability = new Map();
    
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

    // Generate sample sales orders
    this.generateSampleSalesOrders();
    
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
      weeks: this.weeks,
      currentWeekIndex: this.currentWeekIndex
    };
  }
}
module.exports = OrderPlanningSystem;