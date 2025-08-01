// src/analysis/ResultsAnalyzerDaily.js
const moment = require('moment');
const _ = require('lodash');
const path = require('path');
const Logger = require(path.resolve(__dirname,'../utils/Logger'));

// class ResultsAnalyzerDaily {
//   constructor(planningSystem) {
//     this.system = planningSystem;
//     this.logger = Logger.getInstance();
//   }

//   analyzeSolution(solution) {
//     this.logger.info('Analyzing daily optimization solution...');
    
//     const results = [];
//     const capacityUsage = {};
//     const componentUsage = {};
    
//     let totalPenalty = 0.0;
//     let ordersOnTime = 0;
//     let ordersLate = 0;
//     let ordersEarly = 0;
//     let ordersTooEarly = 0;
//     let invalidAssignments = 0;

//     const earliestDayIndex = this.system.getEarliestSchedulableDayIndex();
//     const planningStartDate = this.system.planningStartDate;
//     const minEarlyDays = this.system.minEarlyDeliveryDays;

//     for (const [orderNumber, assignment] of Object.entries(solution)) {
//       const order = this.system.salesOrders.get(orderNumber);
//       if (!order) {
//         invalidAssignments++;
//         continue;
//       }

//       const dayIndex = assignment.dayIndex;

//       // Check for invalid assignments (past dates)
//       if (dayIndex < earliestDayIndex) {
//         invalidAssignments++;
//         results.push({
//           orderNumber,
//           productId: order.productId,
//           customerPriority: order.customerPriority,
//           originalPromiseDate: moment(order.orderPromiseDate).format('YYYY-MM-DD'),
//           optimizedScheduledDate: 'INVALID - PAST DATE',
//           delayDays: 'N/A',
//           isLate: true,
//           isEarly: false,
//           isTooEarly: false,
//           isInvalid: true,
//           orderQty: order.orderQty,
//           revenue: order.revenue
//         });
//         continue;
//       }

//       // Check for too-early assignments
//       const orderEarliestDay = this.system.getEarliestSchedulableDayForOrder(orderNumber);
//       if (dayIndex < orderEarliestDay) {
//         ordersTooEarly++;
//         results.push({
//           orderNumber,
//           productId: order.productId,
//           customerPriority: order.customerPriority,
//           originalPromiseDate: moment(order.orderPromiseDate).format('YYYY-MM-DD'),
//           optimizedScheduledDate: 'TOO EARLY - VIOLATES CONSTRAINT',
//           delayDays: 'N/A',
//           isLate: false,
//           isEarly: false,
//           isTooEarly: true,
//           isInvalid: true,
//           orderQty: order.orderQty,
//           revenue: order.revenue
//         });
//         continue;
//       }

//       if (dayIndex >= this.system.dailyBuckets.length) {
//         invalidAssignments++;
//         continue;
//       }

//       const scheduledDate = this.system.dayIndexToDate(dayIndex);
//       const promiseDate = moment(order.orderPromiseDate);

//       if (!scheduledDate) {
//         invalidAssignments++;
//         continue;
//       }

//       // Ensure scheduled date is not before planning start date
//       const finalScheduledDate = moment.max(scheduledDate, planningStartDate);

//       // Calculate delays/advances
//       const delayDays = finalScheduledDate.diff(promiseDate, 'days');
//       const isLate = delayDays > 0;
//       const isEarly = delayDays < 0 && Math.abs(delayDays) <= minEarlyDays;
//       const isTooEarly = delayDays < -minEarlyDays;

//       if (isLate) {
//         ordersLate++;
//         const penaltyKey = `${order.customerPriority}_${order.productId}`;
//         const penaltyRule = this.system.penaltyRules.get(penaltyKey);
//         if (penaltyRule) {
//           const penalty = penaltyRule.lateDeliveryPenalty * (Math.floor(delayDays / 7) + 1);
//           totalPenalty += penalty;
//         }
//       } else if (isEarly) {
//         ordersEarly++;
//       } else if (delayDays === 0) {
//         ordersOnTime++;
//       }

//       // Track daily capacity usage
//       const scheduledDateStr = finalScheduledDate.format('YYYY-MM-DD');
//       for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
//         if (!capacityUsage[lineRestriction]) {
//           capacityUsage[lineRestriction] = {};
//         }
//         if (!capacityUsage[lineRestriction][scheduledDateStr]) {
//           capacityUsage[lineRestriction][scheduledDateStr] = 0;
//         }
//         capacityUsage[lineRestriction][scheduledDateStr] += order.orderQty;
//       }

//       // Track daily component usage
//       for (const [component, requiredQty] of Object.entries(order.components)) {
//         if (!componentUsage[component]) {
//           componentUsage[component] = {};
//         }
//         if (!componentUsage[component][scheduledDateStr]) {
//           componentUsage[component][scheduledDateStr] = 0;
//         }
//         componentUsage[component][scheduledDateStr] += requiredQty;
//       }

//       results.push({
//         orderNumber,
//         productId: order.productId,
//         customerPriority: order.customerPriority,
//         originalPromiseDate: promiseDate.format('YYYY-MM-DD'),
//         optimizedScheduledDate: finalScheduledDate.format('YYYY-MM-DD'),
//         dayIndex: dayIndex,
//         delayDays: delayDays,
//         isLate: isLate,
//         isEarly: isEarly,
//         isTooEarly: isTooEarly,
//         isInvalid: false,
//         orderQty: order.orderQty,
//         revenue: order.revenue
//       });
//     }

//     const totalValidOrders = ordersOnTime + ordersLate + ordersEarly;
//     const onTimePercentage = totalValidOrders > 0 ? (ordersOnTime / totalValidOrders * 100) : 0;

//     const analysisResults = {
//       orderResults: results,
//       capacityUsage: capacityUsage,
//       componentUsage: componentUsage,
//       totalPenalty: totalPenalty,
//       ordersOnTime: ordersOnTime,
//       ordersLate: ordersLate,
//       ordersEarly: ordersEarly,
//       ordersTooEarly: ordersTooEarly,
//       invalidAssignments: invalidAssignments,
//       totalValidOrders: totalValidOrders,
//       onTimePercentage: onTimePercentage,
//       planningStartDate: planningStartDate.format('YYYY-MM-DD'),
//       minEarlyDeliveryDays: minEarlyDays,
//       currentDayIndex: this.system.currentDayIndex,
//       planningHorizonDays: this.system.planningHorizonDays
//     };

//     this.logger.info(`Daily analysis completed: ${totalValidOrders} valid orders, ${onTimePercentage.toFixed(1)}% on-time`);
    
//     return analysisResults;
//   }

//   generateComparisonReport(analysisResults) {
//     const report = {
//       summary: {
//         totalOrders: analysisResults.orderResults.length,
//         validAssignments: analysisResults.totalValidOrders,
//         invalidAssignments: analysisResults.invalidAssignments,
//         ordersTooEarly: analysisResults.ordersTooEarly,
//         ordersOnTime: analysisResults.ordersOnTime,
//         ordersEarly: analysisResults.ordersEarly,
//         ordersLate: analysisResults.ordersLate,
//         onTimePercentage: analysisResults.onTimePercentage,
//         totalPenalty: analysisResults.totalPenalty,
//         planningStartDate: analysisResults.planningStartDate,
//         minEarlyDeliveryDays: analysisResults.minEarlyDeliveryDays,
//         currentDayIndex: analysisResults.currentDayIndex,
//         planningHorizonDays: analysisResults.planningHorizonDays
//       },
//       constraints: {
//         planningStartDate: analysisResults.planningStartDate,
//         minEarlyDeliveryWindow: analysisResults.minEarlyDeliveryDays,
//         planningHorizonDays: analysisResults.planningHorizonDays
//       },
//       performanceMetrics: this.calculatePerformanceMetrics(analysisResults),
//       priorityBreakdown: this.calculatePriorityBreakdown(analysisResults),
//       priorityCompliance: this.analyzePriorityCompliance(analysisResults),
//       capacityUtilization: this.calculateCapacityUtilization(analysisResults),
//       timelineMetrics: this.calculateTimelineMetrics(analysisResults),
//       underUtilizationAnalysis: this.analyzeUnderUtilization(analysisResults)
//     };

//     return report;
//   }

//   calculatePerformanceMetrics(analysisResults) {
//     const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid);
//     const lateOrders = validOrders.filter(order => order.isLate);
//     const earlyOrders = validOrders.filter(order => order.isEarly);

//     return {
//       averageDelay: lateOrders.length > 0 ? _.mean(lateOrders.map(order => order.delayDays)) : 0,
//       maximumDelay: lateOrders.length > 0 ? _.max(lateOrders.map(order => order.delayDays)) : 0,
//       averageEarlyDelivery: earlyOrders.length > 0 ? _.mean(earlyOrders.map(order => Math.abs(order.delayDays))) : 0,
//       totalRevenueAtRisk: _.sum(lateOrders.map(order => order.revenue)),
//       totalRevenue: _.sum(validOrders.map(order => order.revenue)),
//       fulfillmentRate: (analysisResults.totalValidOrders / analysisResults.orderResults.length) * 100,
//       onTimeDeliveryRate: analysisResults.onTimePercentage
//     };
//   }

//   calculatePriorityBreakdown(analysisResults) {
//     const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid);
//     const priorityGroups = _.groupBy(validOrders, 'customerPriority');

//     const breakdown = {};
//     for (const [priority, orders] of Object.entries(priorityGroups)) {
//       const lateOrders = orders.filter(order => order.isLate);
//       const onTimeOrders = orders.filter(order => !order.isLate);
      
//       breakdown[priority] = {
//         totalOrders: orders.length,
//         lateOrders: lateOrders.length,
//         onTimeOrders: onTimeOrders.length,
//         onTimeRate: ((orders.length - lateOrders.length) / orders.length * 100),
//         averageDelay: lateOrders.length > 0 ? _.mean(lateOrders.map(order => order.delayDays)) : 0,
//         maximumDelay: lateOrders.length > 0 ? _.max(lateOrders.map(order => order.delayDays)) : 0,
//         totalRevenue: _.sum(orders.map(order => order.revenue)),
//         revenueAtRisk: _.sum(lateOrders.map(order => order.revenue))
//       };
//     }

//     return breakdown;
//   }

//   calculateCapacityUtilization(analysisResults) {
//     const utilization = {};
    
//     for (const [line, dailyUsage] of Object.entries(analysisResults.capacityUsage)) {
//       const restriction = this.system.lineRestrictions.get(line);
//       if (restriction && restriction.dailyCapacity) {
//         const usageValues = Object.values(dailyUsage);
//         const capacityValues = Object.values(restriction.dailyCapacity).filter(cap => cap > 0);
        
//         const maxUsage = usageValues.length > 0 ? Math.max(...usageValues) : 0;
//         const totalUsage = _.sum(usageValues);
//         const avgCapacity = capacityValues.length > 0 ? _.mean(capacityValues) : 0;
//         const totalCapacity = _.sum(capacityValues);
        
//         const peakUtilization = avgCapacity > 0 ? (maxUsage / avgCapacity * 100) : 0;
//         const averageUtilization = totalCapacity > 0 ? (totalUsage / totalCapacity * 100) : 0;

//         // Calculate violations
//         const violations = [];
//         for (const [date, usage] of Object.entries(dailyUsage)) {
//           const capacity = restriction.dailyCapacity[date] || 0;
//           if (usage > capacity) {
//             violations.push({
//               date: date,
//               capacity: capacity,
//               usage: usage,
//               excess: usage - capacity,
//               excessPercentage: capacity > 0 ? ((usage - capacity) / capacity * 100) : 0
//             });
//           }
//         }

//         utilization[line] = {
//           maxUsage: maxUsage,
//           totalUsage: totalUsage,
//           avgCapacity: avgCapacity,
//           totalCapacity: totalCapacity,
//           peakUtilization: peakUtilization,
//           averageUtilization: averageUtilization,
//           penaltyCostPerViolation: restriction.penaltyCost,
//           violationCount: violations.length,
//           violations: violations
//         };
//       }
//     }

//     return utilization;
//   }

//   analyzePriorityCompliance(analysisResults) {
//     const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid && typeof order.delayDays === 'number');
//     const complianceByPriority = {};
  
//     for (const order of validOrders) {
//       const priority = order.customerPriority;
//       const priorityCriteria = this.system.getPriorityDeliveryCriteria(priority);
//       const isCompliant = order.delayDays <= priorityCriteria.maxDelayDays;
  
//       if (!complianceByPriority[priority]) {
//         complianceByPriority[priority] = {
//           priority: priority,
//           maxAllowedDelay: priorityCriteria.maxDelayDays,
//           penaltyMultiplier: priorityCriteria.penaltyMultiplier,
//           description: priorityCriteria.description,
//           totalOrders: 0,
//           compliantOrders: 0,
//           nonCompliantOrders: 0,
//           averageDelay: 0,
//           worstDelay: 0,
//           complianceRate: 0,
//           totalRevenue: 0,
//           revenueAtRisk: 0
//         };
//       }
  
//       const stats = complianceByPriority[priority];
//       stats.totalOrders++;
//       stats.totalRevenue += order.revenue;
      
//       if (isCompliant) {
//         stats.compliantOrders++;
//       } else {
//         stats.nonCompliantOrders++;
//         stats.revenueAtRisk += order.revenue;
//       }
  
//       // Track delay statistics
//       if (order.delayDays > stats.worstDelay) {
//         stats.worstDelay = order.delayDays;
//       }
//     }
  
//     // Calculate final statistics
//     for (const priority in complianceByPriority) {
//       const stats = complianceByPriority[priority];
//       const priorityOrders = validOrders.filter(o => o.customerPriority === priority);
//       stats.averageDelay = priorityOrders.length > 0 ? 
//         priorityOrders.reduce((sum, o) => sum + o.delayDays, 0) / priorityOrders.length : 0;
//       stats.complianceRate = stats.totalOrders > 0 ? 
//         (stats.compliantOrders / stats.totalOrders * 100).toFixed(1) : '0.0';
//     }
  
//     return complianceByPriority;
//   }

//   calculateTimelineMetrics(analysisResults) {
//     const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid);
//     const currentDay = this.system.getCurrentDayIndex();
    
//     const timelineMetrics = {
//       nearTerm: { days: 30, orders: 0, revenue: 0, capacity: 0 },   // 0-30 days
//       midTerm: { days: 60, orders: 0, revenue: 0, capacity: 0 },    // 31-90 days  
//       longTerm: { days: 275, orders: 0, revenue: 0, capacity: 0 },  // 91+ days
//       dailyDistribution: {},
//       weeklyDistribution: {},
//       monthlyDistribution: {}
//     };

//     for (const order of validOrders) {
//       const daysFromNow = order.dayIndex - currentDay;
      
//       // Categorize by timeline
//       if (daysFromNow <= 30) {
//         timelineMetrics.nearTerm.orders++;
//         timelineMetrics.nearTerm.revenue += order.revenue;
//       } else if (daysFromNow <= 90) {
//         timelineMetrics.midTerm.orders++;
//         timelineMetrics.midTerm.revenue += order.revenue;
//       } else {
//         timelineMetrics.longTerm.orders++;
//         timelineMetrics.longTerm.revenue += order.revenue;
//       }

//       // Daily distribution
//       const date = order.optimizedScheduledDate;
//       if (!timelineMetrics.dailyDistribution[date]) {
//         timelineMetrics.dailyDistribution[date] = { orders: 0, revenue: 0, quantity: 0 };
//       }
//       timelineMetrics.dailyDistribution[date].orders++;
//       timelineMetrics.dailyDistribution[date].revenue += order.revenue;
//       timelineMetrics.dailyDistribution[date].quantity += order.orderQty;

//       // Weekly distribution
//       const weekNumber = moment(date).week();
//       const year = moment(date).year();
//       const weekKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
//       if (!timelineMetrics.weeklyDistribution[weekKey]) {
//         timelineMetrics.weeklyDistribution[weekKey] = { orders: 0, revenue: 0, quantity: 0 };
//       }
//       timelineMetrics.weeklyDistribution[weekKey].orders++;
//       timelineMetrics.weeklyDistribution[weekKey].revenue += order.revenue;
//       timelineMetrics.weeklyDistribution[weekKey].quantity += order.orderQty;

//       // Monthly distribution
//       const monthKey = moment(date).format('YYYY-MM');
//       if (!timelineMetrics.monthlyDistribution[monthKey]) {
//         timelineMetrics.monthlyDistribution[monthKey] = { orders: 0, revenue: 0, quantity: 0 };
//       }
//       timelineMetrics.monthlyDistribution[monthKey].orders++;
//       timelineMetrics.monthlyDistribution[monthKey].revenue += order.revenue;
//       timelineMetrics.monthlyDistribution[monthKey].quantity += order.orderQty;
//     }

//     return timelineMetrics;
//   }

//   analyzeUnderUtilization(analysisResults) {
//     const underUtilization = {
//       totalDaysAnalyzed: 0,
//       underUtilizedDays: 0,
//       wastedCapacity: 0,
//       underUtilizationRate: 0,
//       lineDetails: {},
//       nearTermWaste: 0,  // First 30 days
//       midTermWaste: 0,   // 31-90 days
//       longTermWaste: 0   // 91+ days
//     };

//     const currentDay = this.system.getCurrentDayIndex();
//     const targetUtilization = this.system.underUtilizationConfig.targetUtilizationRate;

//     for (const [lineName, restriction] of this.system.lineRestrictions) {
//       if (!restriction.dailyCapacity) continue;

//       underUtilization.lineDetails[lineName] = {
//         totalCapacity: 0,
//         usedCapacity: 0,
//         wastedCapacity: 0,
//         utilizationRate: 0,
//         underUtilizedDays: 0,
//         totalDays: 0
//       };

//       const lineUsage = analysisResults.capacityUsage[lineName] || {};

//       // Analyze first 90 days
//       for (let dayIndex = 0; dayIndex < Math.min(90, this.system.dailyBuckets.length); dayIndex++) {
//         const day = this.system.dailyBuckets[dayIndex];
//         const dateStr = day.date;
//         const capacity = restriction.dailyCapacity[dateStr] || 0;
//         const usage = lineUsage[dateStr] || 0;

//         if (capacity > 0) {
//           underUtilization.totalDaysAnalyzed++;
//           underUtilization.lineDetails[lineName].totalDays++;
//           underUtilization.lineDetails[lineName].totalCapacity += capacity;
//           underUtilization.lineDetails[lineName].usedCapacity += Math.min(usage, capacity);

//           const utilizationRate = usage / capacity;
//           if (utilizationRate < targetUtilization) {
//             const waste = (targetUtilization - utilizationRate) * capacity;
//             underUtilization.underUtilizedDays++;
//             underUtilization.wastedCapacity += waste;
//             underUtilization.lineDetails[lineName].underUtilizedDays++;
//             underUtilization.lineDetails[lineName].wastedCapacity += waste;

//             // Categorize by timeline
//             const daysFromNow = dayIndex - currentDay;
//             if (daysFromNow <= 30) {
//               underUtilization.nearTermWaste += waste;
//             } else if (daysFromNow <= 90) {
//               underUtilization.midTermWaste += waste;
//             } else {
//               underUtilization.longTermWaste += waste;
//             }
//           }
//         }
//       }

//       // Calculate line utilization rate
//       const lineData = underUtilization.lineDetails[lineName];
//       if (lineData.totalCapacity > 0) {
//         lineData.utilizationRate = (lineData.usedCapacity / lineData.totalCapacity) * 100;
//       }
//     }

//     // Calculate overall under-utilization rate
//     if (underUtilization.totalDaysAnalyzed > 0) {
//       underUtilization.underUtilizationRate = 
//         (underUtilization.underUtilizedDays / underUtilization.totalDaysAnalyzed) * 100;
//     }

//     return underUtilization;
//   }
// }

class ResultsAnalyzerDaily {
  constructor(planningSystem) {
    this.system = planningSystem;
    this.logger = Logger.getInstance();
  }

  analyzeSolution(solution, penaltyBreakdown = null) {
    const orderResults = [];
    const capacityUsage = {};
    const componentUsage = {};
    
    // FIXED: Initialize penalty tracking
    let totalPenalty = 0;
    let capacityViolations = 0;
    let zeroCapacityViolations = 0;
    let invalidAssignments = 0;
    
    // Initialize capacity tracking
    for (const [lineName] of this.system.lineRestrictions) {
      capacityUsage[lineName] = {};
    }

    // Initialize component tracking
    for (const [componentId] of this.system.componentAvailability) {
      componentUsage[componentId] = {};
    }

    // Process each order in the solution
    for (const [orderNumber, assignment] of Object.entries(solution)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (!order) continue;

      const orderResult = this.analyzeOrderAssignment(order, assignment);
      orderResults.push(orderResult);

      // FIXED: Track penalties
      if (orderResult.isInvalid) {
        invalidAssignments++;
        totalPenalty += 200000; // Match the penalty from genetic algorithm
      }

      // Track capacity usage
      if (!orderResult.isInvalid && assignment.operationsAssignment) {
        const dayIndex = assignment.dayIndex;
        
        for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
          if (!capacityUsage[lineRestriction]) {
            capacityUsage[lineRestriction] = {};
          }
          if (!capacityUsage[lineRestriction][dayIndex]) {
            capacityUsage[lineRestriction][dayIndex] = 0;
          }
          
          capacityUsage[lineRestriction][dayIndex] += order.orderQty;
          
          // FIXED: Check for capacity violations
          const restriction = this.system.lineRestrictions.get(lineRestriction);
          if (restriction && restriction.dailyCapacity) {
            const day = this.system.dailyBuckets[dayIndex];
            const maxCapacity = restriction.dailyCapacity[day.date] || 0;
            const currentUsage = capacityUsage[lineRestriction][dayIndex];
            
            if (currentUsage > maxCapacity) {
              const excess = currentUsage - maxCapacity;
              capacityViolations += excess;
              
              if (maxCapacity === 0) {
                zeroCapacityViolations += excess;
                totalPenalty += excess * 10000; // Match penalty from genetic algorithm
              } else {
                totalPenalty += restriction.penaltyCost * Math.pow(excess, 2);
              }
            }
          }
        }
      }

      // Track component usage
      if (!orderResult.isInvalid) {
        const scheduledDate = orderResult.optimizedScheduledDate;
        for (const [component, requiredQty] of Object.entries(order.components)) {
          if (!componentUsage[component]) {
            componentUsage[component] = {};
          }
          
          const dateKey = moment(scheduledDate).format('YYYY-MM-DD');
          if (!componentUsage[component][dateKey]) {
            componentUsage[component][dateKey] = 0;
          }
          componentUsage[component][dateKey] += requiredQty;
        }
      }
    }

    // Calculate summary statistics
    const validOrders = orderResults.filter(r => !r.isInvalid);
    const onTimeOrders = validOrders.filter(r => !r.isLate && !r.isEarly);
    const earlyOrders = validOrders.filter(r => r.isEarly);
    const lateOrders = validOrders.filter(r => r.isLate);

    const analysisResults = {
      planningStartDate: this.system.planningStartDate.format('YYYY-MM-DD'),
      minEarlyDeliveryDays: this.system.minEarlyDeliveryDays,
      orderResults: orderResults,
      
      // Order statistics
      totalOrders: orderResults.length,
      totalValidOrders: validOrders.length,
      invalidAssignments: invalidAssignments,
      ordersTooEarly: orderResults.filter(r => r.schedulingViolation === 'TOO_EARLY').length,
      ordersOnTime: onTimeOrders.length,
      ordersEarly: earlyOrders.length,
      ordersLate: lateOrders.length,
      
      // Performance metrics
      onTimePercentage: validOrders.length > 0 ? (onTimeOrders.length / validOrders.length) * 100 : 0,
      validOrdersPercentage: orderResults.length > 0 ? (validOrders.length / orderResults.length) * 100 : 0,
      
      // FIXED: Penalty information
      totalPenalty: totalPenalty,
      capacityViolations: capacityViolations,
      zeroCapacityViolations: zeroCapacityViolations,
      penaltyBreakdown: penaltyBreakdown,
      
      // Resource usage
      capacityUsage: capacityUsage,
      componentUsage: componentUsage,
      
      // FIXED: Capacity violation analysis
      capacityViolationAnalysis: this.analyzeCapacityViolations(capacityUsage)
    };

    return analysisResults;
  }

  analyzeOrderAssignment(order, assignment) {
    const dayIndex = assignment.dayIndex;
    const earliestDay = this.system.getEarliestSchedulableDayIndex();
    const orderEarliestDay = this.system.getEarliestSchedulableDayForOrder(order.orderNumber);

    // Check for invalid assignments
    if (assignment.invalidAssignment) {
      return {
        orderNumber: order.orderNumber,
        productId: order.productId,
        customerPriority: order.customerPriority,
        orderQty: order.orderQty,
        revenue: order.revenue,
        originalPromiseDate: moment(order.orderPromiseDate).format('YYYY-MM-DD'),
        optimizedScheduledDate: 'INVALID - NO CAPACITY',
        delayDays: 'N/A',
        isEarly: false,
        isLate: false,
        isInvalid: true,
        schedulingViolation: 'INVALID_ASSIGNMENT'
      };
    }

    // Check for past scheduling
    if (dayIndex < earliestDay) {
      return {
        orderNumber: order.orderNumber,
        productId: order.productId,
        customerPriority: order.customerPriority,
        orderQty: order.orderQty,
        revenue: order.revenue,
        originalPromiseDate: moment(order.orderPromiseDate).format('YYYY-MM-DD'),
        optimizedScheduledDate: 'INVALID - PAST DATE',
        delayDays: 'N/A',
        isEarly: false,
        isLate: false,
        isInvalid: true,
        schedulingViolation: 'PAST_SCHEDULING'
      };
    }

    // Check for too early scheduling
    if (dayIndex < orderEarliestDay) {
      return {
        orderNumber: order.orderNumber,
        productId: order.productId,
        customerPriority: order.customerPriority,
        orderQty: order.orderQty,
        revenue: order.revenue,
        originalPromiseDate: moment(order.orderPromiseDate).format('YYYY-MM-DD'),
        optimizedScheduledDate: 'TOO EARLY - VIOLATES CONSTRAINT',
        delayDays: 'N/A',
        isEarly: false,
        isLate: false,
        isInvalid: true,
        schedulingViolation: 'TOO_EARLY'
      };
    }

    // Check for beyond horizon scheduling
    if (dayIndex >= this.system.dailyBuckets.length) {
      return {
        orderNumber: order.orderNumber,
        productId: order.productId,
        customerPriority: order.customerPriority,
        orderQty: order.orderQty,
        revenue: order.revenue,
        originalPromiseDate: moment(order.orderPromiseDate).format('YYYY-MM-DD'),
        optimizedScheduledDate: 'BEYOND PLANNING HORIZON',
        delayDays: 'N/A',
        isEarly: false,
        isLate: false,
        isInvalid: true,
        schedulingViolation: 'BEYOND_HORIZON'
      };
    }

    // Valid assignment - calculate timing
    const scheduledDate = this.system.dayIndexToDate(dayIndex);
    const promiseDate = moment(order.orderPromiseDate);
    const daysDifference = scheduledDate.diff(promiseDate, 'days');

    const isEarly = daysDifference < -this.system.minEarlyDeliveryDays;
    const isLate = daysDifference > 0;

    return {
      orderNumber: order.orderNumber,
      productId: order.productId,
      customerPriority: order.customerPriority,
      orderQty: order.orderQty,
      revenue: order.revenue,
      originalPromiseDate: promiseDate.format('YYYY-MM-DD'),
      optimizedScheduledDate: scheduledDate.format('YYYY-MM-DD'),
      delayDays: daysDifference,
      isEarly: isEarly,
      isLate: isLate,
      isInvalid: false,
      schedulingViolation: null,
      // FIXED: Add capacity violation info for this order
      operationsAssignment: assignment.operationsAssignment
    };
  }

  // FIXED: Analyze capacity violations in detail
  analyzeCapacityViolations(capacityUsage) {
    const violations = [];
    let totalViolationDays = 0;
    let totalExcessUnits = 0;

    for (const [lineName, restriction] of this.system.lineRestrictions) {
      if (!restriction.dailyCapacity) continue;

      const lineViolations = [];
      
      for (let dayIndex = 0; dayIndex < this.system.dailyBuckets.length; dayIndex++) {
        const day = this.system.dailyBuckets[dayIndex];
        const maxCapacity = restriction.dailyCapacity[day.date] || 0;
        const actualUsage = capacityUsage[lineName] && capacityUsage[lineName][dayIndex] || 0;

        if (actualUsage > maxCapacity) {
          const excess = actualUsage - maxCapacity;
          const violation = {
            dayIndex: dayIndex,
            date: day.date,
            maxCapacity: maxCapacity,
            actualUsage: actualUsage,
            excess: excess,
            isZeroCapacityViolation: maxCapacity === 0
          };
          
          lineViolations.push(violation);
          totalViolationDays++;
          totalExcessUnits += excess;
        }
      }

      if (lineViolations.length > 0) {
        violations.push({
          lineName: lineName,
          violationCount: lineViolations.length,
          violations: lineViolations,
          totalExcess: lineViolations.reduce((sum, v) => sum + v.excess, 0),
          zeroCapacityViolations: lineViolations.filter(v => v.isZeroCapacityViolation).length
        });
      }
    }

    return {
      hasViolations: violations.length > 0,
      totalViolatedLines: violations.length,
      totalViolationDays: totalViolationDays,
      totalExcessUnits: totalExcessUnits,
      zeroCapacityViolationDays: violations.reduce((sum, line) => sum + line.zeroCapacityViolations, 0),
      violationsByLine: violations
    };
  }

  generateComparisonReport(analysisResults) {
    const validOrders = analysisResults.orderResults.filter(r => !r.isInvalid);
    
    // Priority analysis
    const priorityBreakdown = this.analyzePriorityPerformance(validOrders);
    
    // FIXED: Priority compliance analysis (based on delay tolerances)
    const priorityCompliance = this.analyzePriorityCompliance(validOrders);

    // Capacity utilization analysis
    const capacityUtilization = this.analyzeCapacityUtilization(analysisResults.capacityUsage);

    const comparisonReport = {
      summary: {
        totalOrders: analysisResults.totalOrders,
        validOrders: analysisResults.totalValidOrders,
        invalidOrders: analysisResults.invalidAssignments,
        validOrdersPercentage: analysisResults.validOrdersPercentage.toFixed(1),
        onTimeOrders: analysisResults.ordersOnTime,
        onTimePercentage: analysisResults.onTimePercentage.toFixed(1),
        // FIXED: Add penalty information to summary
        totalPenalty: analysisResults.totalPenalty,
        capacityViolations: analysisResults.capacityViolations,
        zeroCapacityViolations: analysisResults.zeroCapacityViolations
      },
      
      performanceMetrics: {
        validAssignments: analysisResults.totalValidOrders,
        invalidAssignments: analysisResults.invalidAssignments,
        onTimeDeliveries: analysisResults.ordersOnTime,
        earlyDeliveries: analysisResults.ordersEarly,
        lateDeliveries: analysisResults.ordersLate,
        averageDelay: this.calculateAverageDelay(validOrders)
      },
      
      priorityBreakdown: priorityBreakdown,
      priorityCompliance: priorityCompliance,
      capacityUtilization: capacityUtilization,
      
      // FIXED: Add detailed penalty breakdown
      penaltyAnalysis: analysisResults.penaltyBreakdown || {
        penalties: { totalPenalty: analysisResults.totalPenalty },
        message: 'Detailed penalty breakdown not available'
      },
      
      // FIXED: Add capacity violation analysis
      capacityViolationSummary: analysisResults.capacityViolationAnalysis
    };

    return comparisonReport;
  }

  analyzePriorityPerformance(validOrders) {
    const priorityGroups = {};

    validOrders.forEach(order => {
      if (!priorityGroups[order.customerPriority]) {
        priorityGroups[order.customerPriority] = {
          totalOrders: 0,
          onTimeOrders: 0,
          earlyOrders: 0,
          lateOrders: 0,
          totalRevenue: 0,
          totalDelay: 0
        };
      }

      const group = priorityGroups[order.customerPriority];
      group.totalOrders++;
      group.totalRevenue += order.revenue;

      if (order.isLate) {
        group.lateOrders++;
        group.totalDelay += order.delayDays;
      } else if (order.isEarly) {
        group.earlyOrders++;
      } else {
        group.onTimeOrders++;
      }
    });

    return Object.entries(priorityGroups).map(([priority, data]) => ({
      customerPriority: priority,
      totalOrders: data.totalOrders,
      onTimeOrders: data.onTimeOrders,
      earlyOrders: data.earlyOrders,
      lateOrders: data.lateOrders,
      onTimePercentage: ((data.onTimeOrders / data.totalOrders) * 100).toFixed(1),
      averageDelay: data.lateOrders > 0 ? (data.totalDelay / data.lateOrders).toFixed(1) : 0,
      totalRevenue: data.totalRevenue.toFixed(2)
    }));
  }

  // FIXED: New method to analyze priority compliance based on delivery criteria
  analyzePriorityCompliance(validOrders) {
    const complianceData = {};

    validOrders.forEach(order => {
      const criteria = this.system.getPriorityDeliveryCriteria(order.customerPriority);
      
      if (!complianceData[order.customerPriority]) {
        complianceData[order.customerPriority] = {
          priority: order.customerPriority,
          maxAllowedDelay: criteria.maxDelayDays,
          penaltyMultiplier: criteria.penaltyMultiplier,
          totalOrders: 0,
          compliantOrders: 0,
          violatingOrders: 0,
          averageViolation: 0,
          totalViolationDays: 0
        };
      }

      const compliance = complianceData[order.customerPriority];
      compliance.totalOrders++;

      if (order.delayDays <= criteria.maxDelayDays) {
        compliance.compliantOrders++;
      } else {
        compliance.violatingOrders++;
        const violationDays = order.delayDays - criteria.maxDelayDays;
        compliance.totalViolationDays += violationDays;
      }
    });

    // Calculate averages and percentages
    Object.values(complianceData).forEach(data => {
      data.complianceRate = ((data.compliantOrders / data.totalOrders) * 100).toFixed(1);
      data.averageViolation = data.violatingOrders > 0 ? 
        (data.totalViolationDays / data.violatingOrders).toFixed(1) : 0;
    });

    return Object.values(complianceData);
  }

  analyzeCapacityUtilization(capacityUsage) {
    const utilizationData = [];

    for (const [lineName, restriction] of this.system.lineRestrictions) {
      const lineUsage = capacityUsage[lineName] || {};
      const usageValues = Object.values(lineUsage);
      
      if (usageValues.length === 0) {
        utilizationData.push({
          lineRestriction: lineName,
          maxUsage: 0,
          totalUsage: 0,
          averageUsage: 0,
          utilizationRate: 0,
          violationDays: 0
        });
        continue;
      }

      const maxUsage = Math.max(...usageValues);
      const totalUsage = usageValues.reduce((sum, val) => sum + val, 0);
      let violationDays = 0;

      // FIXED: Calculate violations
      if (restriction.dailyCapacity) {
        for (let dayIndex = 0; dayIndex < this.system.dailyBuckets.length; dayIndex++) {
          const day = this.system.dailyBuckets[dayIndex];
          const maxCapacity = restriction.dailyCapacity[day.date] || 0;
          const actualUsage = lineUsage[dayIndex] || 0;
          
          if (actualUsage > maxCapacity) {
            violationDays++;
          }
        }
      }

      utilizationData.push({
        lineRestriction: lineName,
        maxUsage: maxUsage,
        totalUsage: totalUsage,
        averageUsage: usageValues.length > 0 ? (totalUsage / usageValues.length).toFixed(1) : 0,
        utilizationRate: 0, // Would need max capacity to calculate
        violationDays: violationDays
      });
    }

    return utilizationData;
  }

  calculateAverageDelay(validOrders) {
    const lateOrders = validOrders.filter(order => order.isLate && typeof order.delayDays === 'number');
    if (lateOrders.length === 0) return 0;
    
    const totalDelay = lateOrders.reduce((sum, order) => sum + order.delayDays, 0);
    return (totalDelay / lateOrders.length).toFixed(1);
  }
}

module.exports = ResultsAnalyzerDaily;