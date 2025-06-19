// src/analysis/ResultsAnalyzer.js
const moment = require('moment');
const _ = require('lodash');
const path = require('path');
const Logger = require(path.resolve(__dirname,'../utils/Logger'));

class ResultsAnalyzer {
  constructor(planningSystem) {
    this.system = planningSystem;
    this.logger = Logger.getInstance();
  }

  analyzeSolution(solution) {
    this.logger.info('Analyzing optimization solution...');
    
    const results = [];
    const capacityUsage = {};
    const componentUsage = {};
    
    let totalPenalty = 0.0;
    let ordersOnTime = 0;
    let ordersLate = 0;
    let ordersEarly = 0;
    let ordersTooEarly = 0;
    let invalidAssignments = 0;

    const earliestWeekIndex = this.system.getEarliestSchedulableWeekIndex();
    const planningStartDate = this.system.planningStartDate;
    const minEarlyDays = this.system.minEarlyDeliveryDays;

    for (const [orderNumber, assignment] of Object.entries(solution)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (!order) {
        invalidAssignments++;
        continue;
      }

      const weekIndex = assignment.weekIndex;

      // Check for invalid assignments (past dates)
      if (weekIndex < earliestWeekIndex) {
        invalidAssignments++;
        results.push({
          orderNumber,
          productId: order.productId,
          customerPriority: order.customerPriority,
          originalPromiseDate: moment(order.orderPromiseDate).format('YYYY-MM-DD'),
          optimizedScheduledDate: 'INVALID - PAST DATE',
          delayDays: 'N/A',
          isLate: true,
          isEarly: false,
          isTooEarly: false,
          isInvalid: true,
          orderQty: order.orderQty,
          revenue: order.revenue
        });
        continue;
      }

      // Check for too-early assignments
      const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
      if (weekIndex < orderEarliestWeek) {
        ordersTooEarly++;
        results.push({
          orderNumber,
          productId: order.productId,
          customerPriority: order.customerPriority,
          originalPromiseDate: moment(order.orderPromiseDate).format('YYYY-MM-DD'),
          optimizedScheduledDate: 'TOO EARLY - VIOLATES CONSTRAINT',
          delayDays: 'N/A',
          isLate: false,
          isEarly: false,
          isTooEarly: true,
          isInvalid: true,
          orderQty: order.orderQty,
          revenue: order.revenue
        });
        continue;
      }

      if (weekIndex >= this.system.weeks.length) {
        invalidAssignments++;
        continue;
      }

      const scheduledWeek = this.system.weeks[weekIndex];
      const scheduledDate = this.weekToDate(scheduledWeek);
      const promiseDate = moment(order.orderPromiseDate);

      // Ensure scheduled date is not before planning start date
      const finalScheduledDate = moment.max(scheduledDate, planningStartDate);

      // Calculate delays/advances
      const delayDays = finalScheduledDate.diff(promiseDate, 'days');
      const isLate = delayDays > 0;
      const isEarly = delayDays < 0 && Math.abs(delayDays) <= minEarlyDays;
      const isTooEarly = delayDays < -minEarlyDays;

      if (isLate) {
        ordersLate++;
        const penaltyKey = `${order.customerPriority}_${order.productId}`;
        const penaltyRule = this.system.penaltyRules.get(penaltyKey);
        if (penaltyRule) {
          const penalty = penaltyRule.lateDeliveryPenalty * (Math.floor(delayDays / 7) + 1);
          totalPenalty += penalty;
        }
      } else if (isEarly) {
        ordersEarly++;
      } else if (delayDays === 0) {
        ordersOnTime++;
      }

      // Track capacity usage
      for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
        if (!capacityUsage[lineRestriction]) {
          capacityUsage[lineRestriction] = {};
        }
        if (!capacityUsage[lineRestriction][scheduledWeek]) {
          capacityUsage[lineRestriction][scheduledWeek] = 0;
        }
        capacityUsage[lineRestriction][scheduledWeek] += order.orderQty;
      }

      // Track component usage
      for (const [component, requiredQty] of Object.entries(order.components)) {
        if (!componentUsage[component]) {
          componentUsage[component] = {};
        }
        if (!componentUsage[component][scheduledWeek]) {
          componentUsage[component][scheduledWeek] = 0;
        }
        componentUsage[component][scheduledWeek] += requiredQty;
      }

      results.push({
        orderNumber,
        productId: order.productId,
        customerPriority: order.customerPriority,
        originalPromiseDate: promiseDate.format('YYYY-MM-DD'),
        optimizedScheduledDate: finalScheduledDate.format('YYYY-MM-DD'),
        delayDays: delayDays,
        isLate: isLate,
        isEarly: isEarly,
        isTooEarly: isTooEarly,
        isInvalid: false,
        orderQty: order.orderQty,
        revenue: order.revenue
      });
    }

    const totalValidOrders = ordersOnTime + ordersLate + ordersEarly;
    const onTimePercentage = totalValidOrders > 0 ? (ordersOnTime / totalValidOrders * 100) : 0;

    const analysisResults = {
      orderResults: results,
      capacityUsage: capacityUsage,
      componentUsage: componentUsage,
      totalPenalty: totalPenalty,
      ordersOnTime: ordersOnTime,
      ordersLate: ordersLate,
      ordersEarly: ordersEarly,
      ordersTooEarly: ordersTooEarly,
      invalidAssignments: invalidAssignments,
      totalValidOrders: totalValidOrders,
      onTimePercentage: onTimePercentage,
      planningStartDate: planningStartDate.format('YYYY-MM-DD'),
      minEarlyDeliveryDays: minEarlyDays
    };

    this.logger.info(`Analysis completed: ${totalValidOrders} valid orders, ${onTimePercentage.toFixed(1)}% on-time`);
    
    return analysisResults;
  }

  weekToDate(weekStr) {
    const [year, week] = weekStr.substring(1).split('-');
    return moment().year(parseInt(year)).week(parseInt(week)).startOf('week');
  }

  generateComparisonReport(analysisResults) {
    const report = {
      summary: {
        totalOrders: analysisResults.orderResults.length,
        validAssignments: analysisResults.totalValidOrders,
        invalidAssignments: analysisResults.invalidAssignments,
        ordersTooEarly: analysisResults.ordersTooEarly,
        ordersOnTime: analysisResults.ordersOnTime,
        ordersEarly: analysisResults.ordersEarly,
        ordersLate: analysisResults.ordersLate,
        onTimePercentage: analysisResults.onTimePercentage,
        totalPenalty: analysisResults.totalPenalty,
        planningStartDate: analysisResults.planningStartDate,
        minEarlyDeliveryDays: analysisResults.minEarlyDeliveryDays
      },
      constraints: {
        planningStartDate: analysisResults.planningStartDate,
        minEarlyDeliveryWindow: analysisResults.minEarlyDeliveryDays
      },
      performanceMetrics: this.calculatePerformanceMetrics(analysisResults),
      priorityBreakdown: this.calculatePriorityBreakdown(analysisResults),
      capacityUtilization: this.calculateCapacityUtilization(analysisResults)
    };

    return report;
  }

  calculatePerformanceMetrics(analysisResults) {
    const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid);
    const lateOrders = validOrders.filter(order => order.isLate);
    const earlyOrders = validOrders.filter(order => order.isEarly);

    return {
      averageDelay: lateOrders.length > 0 ? _.mean(lateOrders.map(order => order.delayDays)) : 0,
      maximumDelay: lateOrders.length > 0 ? _.max(lateOrders.map(order => order.delayDays)) : 0,
      averageEarlyDelivery: earlyOrders.length > 0 ? _.mean(earlyOrders.map(order => Math.abs(order.delayDays))) : 0,
      totalRevenueAtRisk: _.sum(lateOrders.map(order => order.revenue)),
      totalRevenue: _.sum(validOrders.map(order => order.revenue))
    };
  }

  calculatePriorityBreakdown(analysisResults) {
    const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid);
    const priorityGroups = _.groupBy(validOrders, 'customerPriority');

    const breakdown = {};
    for (const [priority, orders] of Object.entries(priorityGroups)) {
      const lateOrders = orders.filter(order => order.isLate);
      breakdown[priority] = {
        totalOrders: orders.length,
        lateOrders: lateOrders.length,
        onTimeRate: ((orders.length - lateOrders.length) / orders.length * 100),
        averageDelay: lateOrders.length > 0 ? _.mean(lateOrders.map(order => order.delayDays)) : 0,
        totalRevenue: _.sum(orders.map(order => order.revenue))
      };
    }

    return breakdown;
  }

  calculateCapacityUtilization(analysisResults) {
    const utilization = {};
    
    for (const [line, weeklyUsage] of Object.entries(analysisResults.capacityUsage)) {
      const restriction = this.system.lineRestrictions.get(line);
      if (restriction) {
        const maxUsage = Math.max(...Object.values(weeklyUsage));
        const avgCapacity = _.mean(Object.values(restriction.weeklyCapacity));
        const peakUtilization = avgCapacity > 0 ? (maxUsage / avgCapacity * 100) : 0;

        utilization[line] = {
          maxUsage: maxUsage,
          totalUsage: _.sum(Object.values(weeklyUsage)),
          avgCapacity: avgCapacity,
          peakUtilization: peakUtilization,
          penaltyCostPerViolation: restriction.penaltyCost
        };
      }
    }

    return utilization;
  }
}

module.exports = ResultsAnalyzer;