// src/analysis/ResultsAnalyzerDaily.js
const moment = require('moment');
const _ = require('lodash');
const path = require('path');
const Logger = require(path.resolve(__dirname,'../utils/Logger'));

class ResultsAnalyzerDaily {
  constructor(planningSystem) {
    this.system = planningSystem;
    this.logger = Logger.getInstance();
  }

  analyzeSolution(solution) {
    this.logger.info('Analyzing daily optimization solution...');
    
    const results = [];
    const capacityUsage = {};
    const componentUsage = {};
    
    let totalPenalty = 0.0;
    let ordersOnTime = 0;
    let ordersLate = 0;
    let ordersEarly = 0;
    let ordersTooEarly = 0;
    let invalidAssignments = 0;

    const earliestDayIndex = this.system.getEarliestSchedulableDayIndex();
    const planningStartDate = this.system.planningStartDate;
    const minEarlyDays = this.system.minEarlyDeliveryDays;

    for (const [orderNumber, assignment] of Object.entries(solution)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (!order) {
        invalidAssignments++;
        continue;
      }

      const dayIndex = assignment.dayIndex;

      // Check for invalid assignments (past dates)
      if (dayIndex < earliestDayIndex) {
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
      const orderEarliestDay = this.system.getEarliestSchedulableDayForOrder(orderNumber);
      if (dayIndex < orderEarliestDay) {
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

      if (dayIndex >= this.system.dailyBuckets.length) {
        invalidAssignments++;
        continue;
      }

      const scheduledDate = this.system.dayIndexToDate(dayIndex);
      const promiseDate = moment(order.orderPromiseDate);

      if (!scheduledDate) {
        invalidAssignments++;
        continue;
      }

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

      // Track daily capacity usage
      const scheduledDateStr = finalScheduledDate.format('YYYY-MM-DD');
      for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
        if (!capacityUsage[lineRestriction]) {
          capacityUsage[lineRestriction] = {};
        }
        if (!capacityUsage[lineRestriction][scheduledDateStr]) {
          capacityUsage[lineRestriction][scheduledDateStr] = 0;
        }
        capacityUsage[lineRestriction][scheduledDateStr] += order.orderQty;
      }

      // Track daily component usage
      for (const [component, requiredQty] of Object.entries(order.components)) {
        if (!componentUsage[component]) {
          componentUsage[component] = {};
        }
        if (!componentUsage[component][scheduledDateStr]) {
          componentUsage[component][scheduledDateStr] = 0;
        }
        componentUsage[component][scheduledDateStr] += requiredQty;
      }

      results.push({
        orderNumber,
        productId: order.productId,
        customerPriority: order.customerPriority,
        originalPromiseDate: promiseDate.format('YYYY-MM-DD'),
        optimizedScheduledDate: finalScheduledDate.format('YYYY-MM-DD'),
        dayIndex: dayIndex,
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
      minEarlyDeliveryDays: minEarlyDays,
      currentDayIndex: this.system.currentDayIndex,
      planningHorizonDays: this.system.planningHorizonDays
    };

    this.logger.info(`Daily analysis completed: ${totalValidOrders} valid orders, ${onTimePercentage.toFixed(1)}% on-time`);
    
    return analysisResults;
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
        minEarlyDeliveryDays: analysisResults.minEarlyDeliveryDays,
        currentDayIndex: analysisResults.currentDayIndex,
        planningHorizonDays: analysisResults.planningHorizonDays
      },
      constraints: {
        planningStartDate: analysisResults.planningStartDate,
        minEarlyDeliveryWindow: analysisResults.minEarlyDeliveryDays,
        planningHorizonDays: analysisResults.planningHorizonDays
      },
      performanceMetrics: this.calculatePerformanceMetrics(analysisResults),
      priorityBreakdown: this.calculatePriorityBreakdown(analysisResults),
      priorityCompliance: this.analyzePriorityCompliance(analysisResults),
      capacityUtilization: this.calculateCapacityUtilization(analysisResults),
      timelineMetrics: this.calculateTimelineMetrics(analysisResults),
      underUtilizationAnalysis: this.analyzeUnderUtilization(analysisResults)
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
      totalRevenue: _.sum(validOrders.map(order => order.revenue)),
      fulfillmentRate: (analysisResults.totalValidOrders / analysisResults.orderResults.length) * 100,
      onTimeDeliveryRate: analysisResults.onTimePercentage
    };
  }

  calculatePriorityBreakdown(analysisResults) {
    const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid);
    const priorityGroups = _.groupBy(validOrders, 'customerPriority');

    const breakdown = {};
    for (const [priority, orders] of Object.entries(priorityGroups)) {
      const lateOrders = orders.filter(order => order.isLate);
      const onTimeOrders = orders.filter(order => !order.isLate);
      
      breakdown[priority] = {
        totalOrders: orders.length,
        lateOrders: lateOrders.length,
        onTimeOrders: onTimeOrders.length,
        onTimeRate: ((orders.length - lateOrders.length) / orders.length * 100),
        averageDelay: lateOrders.length > 0 ? _.mean(lateOrders.map(order => order.delayDays)) : 0,
        maximumDelay: lateOrders.length > 0 ? _.max(lateOrders.map(order => order.delayDays)) : 0,
        totalRevenue: _.sum(orders.map(order => order.revenue)),
        revenueAtRisk: _.sum(lateOrders.map(order => order.revenue))
      };
    }

    return breakdown;
  }

  calculateCapacityUtilization(analysisResults) {
    const utilization = {};
    
    for (const [line, dailyUsage] of Object.entries(analysisResults.capacityUsage)) {
      const restriction = this.system.lineRestrictions.get(line);
      if (restriction && restriction.dailyCapacity) {
        const usageValues = Object.values(dailyUsage);
        const capacityValues = Object.values(restriction.dailyCapacity).filter(cap => cap > 0);
        
        const maxUsage = usageValues.length > 0 ? Math.max(...usageValues) : 0;
        const totalUsage = _.sum(usageValues);
        const avgCapacity = capacityValues.length > 0 ? _.mean(capacityValues) : 0;
        const totalCapacity = _.sum(capacityValues);
        
        const peakUtilization = avgCapacity > 0 ? (maxUsage / avgCapacity * 100) : 0;
        const averageUtilization = totalCapacity > 0 ? (totalUsage / totalCapacity * 100) : 0;

        // Calculate violations
        const violations = [];
        for (const [date, usage] of Object.entries(dailyUsage)) {
          const capacity = restriction.dailyCapacity[date] || 0;
          if (usage > capacity) {
            violations.push({
              date: date,
              capacity: capacity,
              usage: usage,
              excess: usage - capacity,
              excessPercentage: capacity > 0 ? ((usage - capacity) / capacity * 100) : 0
            });
          }
        }

        utilization[line] = {
          maxUsage: maxUsage,
          totalUsage: totalUsage,
          avgCapacity: avgCapacity,
          totalCapacity: totalCapacity,
          peakUtilization: peakUtilization,
          averageUtilization: averageUtilization,
          penaltyCostPerViolation: restriction.penaltyCost,
          violationCount: violations.length,
          violations: violations
        };
      }
    }

    return utilization;
  }

  analyzePriorityCompliance(analysisResults) {
    const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid && typeof order.delayDays === 'number');
    const complianceByPriority = {};
  
    for (const order of validOrders) {
      const priority = order.customerPriority;
      const priorityCriteria = this.system.getPriorityDeliveryCriteria(priority);
      const isCompliant = order.delayDays <= priorityCriteria.maxDelayDays;
  
      if (!complianceByPriority[priority]) {
        complianceByPriority[priority] = {
          priority: priority,
          maxAllowedDelay: priorityCriteria.maxDelayDays,
          penaltyMultiplier: priorityCriteria.penaltyMultiplier,
          description: priorityCriteria.description,
          totalOrders: 0,
          compliantOrders: 0,
          nonCompliantOrders: 0,
          averageDelay: 0,
          worstDelay: 0,
          complianceRate: 0,
          totalRevenue: 0,
          revenueAtRisk: 0
        };
      }
  
      const stats = complianceByPriority[priority];
      stats.totalOrders++;
      stats.totalRevenue += order.revenue;
      
      if (isCompliant) {
        stats.compliantOrders++;
      } else {
        stats.nonCompliantOrders++;
        stats.revenueAtRisk += order.revenue;
      }
  
      // Track delay statistics
      if (order.delayDays > stats.worstDelay) {
        stats.worstDelay = order.delayDays;
      }
    }
  
    // Calculate final statistics
    for (const priority in complianceByPriority) {
      const stats = complianceByPriority[priority];
      const priorityOrders = validOrders.filter(o => o.customerPriority === priority);
      stats.averageDelay = priorityOrders.length > 0 ? 
        priorityOrders.reduce((sum, o) => sum + o.delayDays, 0) / priorityOrders.length : 0;
      stats.complianceRate = stats.totalOrders > 0 ? 
        (stats.compliantOrders / stats.totalOrders * 100).toFixed(1) : '0.0';
    }
  
    return complianceByPriority;
  }

  calculateTimelineMetrics(analysisResults) {
    const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid);
    const currentDay = this.system.getCurrentDayIndex();
    
    const timelineMetrics = {
      nearTerm: { days: 30, orders: 0, revenue: 0, capacity: 0 },   // 0-30 days
      midTerm: { days: 60, orders: 0, revenue: 0, capacity: 0 },    // 31-90 days  
      longTerm: { days: 275, orders: 0, revenue: 0, capacity: 0 },  // 91+ days
      dailyDistribution: {},
      weeklyDistribution: {},
      monthlyDistribution: {}
    };

    for (const order of validOrders) {
      const daysFromNow = order.dayIndex - currentDay;
      
      // Categorize by timeline
      if (daysFromNow <= 30) {
        timelineMetrics.nearTerm.orders++;
        timelineMetrics.nearTerm.revenue += order.revenue;
      } else if (daysFromNow <= 90) {
        timelineMetrics.midTerm.orders++;
        timelineMetrics.midTerm.revenue += order.revenue;
      } else {
        timelineMetrics.longTerm.orders++;
        timelineMetrics.longTerm.revenue += order.revenue;
      }

      // Daily distribution
      const date = order.optimizedScheduledDate;
      if (!timelineMetrics.dailyDistribution[date]) {
        timelineMetrics.dailyDistribution[date] = { orders: 0, revenue: 0, quantity: 0 };
      }
      timelineMetrics.dailyDistribution[date].orders++;
      timelineMetrics.dailyDistribution[date].revenue += order.revenue;
      timelineMetrics.dailyDistribution[date].quantity += order.orderQty;

      // Weekly distribution
      const weekNumber = moment(date).week();
      const year = moment(date).year();
      const weekKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
      if (!timelineMetrics.weeklyDistribution[weekKey]) {
        timelineMetrics.weeklyDistribution[weekKey] = { orders: 0, revenue: 0, quantity: 0 };
      }
      timelineMetrics.weeklyDistribution[weekKey].orders++;
      timelineMetrics.weeklyDistribution[weekKey].revenue += order.revenue;
      timelineMetrics.weeklyDistribution[weekKey].quantity += order.orderQty;

      // Monthly distribution
      const monthKey = moment(date).format('YYYY-MM');
      if (!timelineMetrics.monthlyDistribution[monthKey]) {
        timelineMetrics.monthlyDistribution[monthKey] = { orders: 0, revenue: 0, quantity: 0 };
      }
      timelineMetrics.monthlyDistribution[monthKey].orders++;
      timelineMetrics.monthlyDistribution[monthKey].revenue += order.revenue;
      timelineMetrics.monthlyDistribution[monthKey].quantity += order.orderQty;
    }

    return timelineMetrics;
  }

  analyzeUnderUtilization(analysisResults) {
    const underUtilization = {
      totalDaysAnalyzed: 0,
      underUtilizedDays: 0,
      wastedCapacity: 0,
      underUtilizationRate: 0,
      lineDetails: {},
      nearTermWaste: 0,  // First 30 days
      midTermWaste: 0,   // 31-90 days
      longTermWaste: 0   // 91+ days
    };

    const currentDay = this.system.getCurrentDayIndex();
    const targetUtilization = this.system.underUtilizationConfig.targetUtilizationRate;

    for (const [lineName, restriction] of this.system.lineRestrictions) {
      if (!restriction.dailyCapacity) continue;

      underUtilization.lineDetails[lineName] = {
        totalCapacity: 0,
        usedCapacity: 0,
        wastedCapacity: 0,
        utilizationRate: 0,
        underUtilizedDays: 0,
        totalDays: 0
      };

      const lineUsage = analysisResults.capacityUsage[lineName] || {};

      // Analyze first 90 days
      for (let dayIndex = 0; dayIndex < Math.min(90, this.system.dailyBuckets.length); dayIndex++) {
        const day = this.system.dailyBuckets[dayIndex];
        const dateStr = day.date;
        const capacity = restriction.dailyCapacity[dateStr] || 0;
        const usage = lineUsage[dateStr] || 0;

        if (capacity > 0) {
          underUtilization.totalDaysAnalyzed++;
          underUtilization.lineDetails[lineName].totalDays++;
          underUtilization.lineDetails[lineName].totalCapacity += capacity;
          underUtilization.lineDetails[lineName].usedCapacity += Math.min(usage, capacity);

          const utilizationRate = usage / capacity;
          if (utilizationRate < targetUtilization) {
            const waste = (targetUtilization - utilizationRate) * capacity;
            underUtilization.underUtilizedDays++;
            underUtilization.wastedCapacity += waste;
            underUtilization.lineDetails[lineName].underUtilizedDays++;
            underUtilization.lineDetails[lineName].wastedCapacity += waste;

            // Categorize by timeline
            const daysFromNow = dayIndex - currentDay;
            if (daysFromNow <= 30) {
              underUtilization.nearTermWaste += waste;
            } else if (daysFromNow <= 90) {
              underUtilization.midTermWaste += waste;
            } else {
              underUtilization.longTermWaste += waste;
            }
          }
        }
      }

      // Calculate line utilization rate
      const lineData = underUtilization.lineDetails[lineName];
      if (lineData.totalCapacity > 0) {
        lineData.utilizationRate = (lineData.usedCapacity / lineData.totalCapacity) * 100;
      }
    }

    // Calculate overall under-utilization rate
    if (underUtilization.totalDaysAnalyzed > 0) {
      underUtilization.underUtilizationRate = 
        (underUtilization.underUtilizedDays / underUtilization.totalDaysAnalyzed) * 100;
    }

    return underUtilization;
  }
}

module.exports = ResultsAnalyzerDaily;