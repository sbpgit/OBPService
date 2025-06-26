// src/optimization/GeneticAlgorithmOptimizer.js
const _ = require('lodash');
const moment = require('moment');
const path = require('path');
const Logger = require(path.resolve(__dirname, '../utils/Logger'));

class GeneticAlgorithmOptimizer {
  constructor(planningSystem, options = {}) {
    this.system = planningSystem;
    this.populationSize = options.populationSize || 100;
    this.generations = options.generations || 50;
    this.mutationRate = options.mutationRate || 0.1;
    this.crossoverRate = options.crossoverRate || 0.8;
    this.tournamentSize = options.tournamentSize || 3;
    // this.logger = Logger.getInstance();
    //New code added on 23/06/2025- Pradeep
    this.promiseDatePreference = options.promiseDatePreference || 0.7;
    this.timingVarianceWeeks = options.timingVarianceWeeks || 3;
    this.unnecessaryDelayPenalty = options.unnecessaryDelayPenalty || 100;
    this.perfectTimingBonus = options.perfectTimingBonus || 50;
    //New code added on 23/06/2025- Pradeep
  }
  cancel() {
    this.cancelled = true;
    console.log("Job Cancellation called");
  }
  createIndividual() {
    const individual = {};
    const capacityTracker = this.initializeCapacityTracker();
    
    // Get all sales orders and sort by priority
    const orderNumbers = Array.from(this.system.salesOrders.keys());
    const sortedOrders = this.sortOrdersByPriority(orderNumbers);

    for (const orderNumber of sortedOrders) {
      const order = this.system.salesOrders.get(orderNumber);
      if (!order) continue;
      
      const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
      
      // Calculate target week (promise date week)
      const promiseDate = moment(order.orderPromiseDate);
      const promiseWeek = `W${promiseDate.format('YYYY-WW')}`;
      let targetWeekIndex = this.system.weeks.indexOf(promiseWeek);
      
      if (targetWeekIndex < 0) {
        targetWeekIndex = Math.max(orderEarliestWeek, this.system.getEarliestSchedulableWeekIndex() + 2);
      }
      
      targetWeekIndex = Math.max(targetWeekIndex, orderEarliestWeek);
      
      // Find the best week with available capacity
      const bestWeek = this.findBestAvailableWeek(order, targetWeekIndex, capacityTracker);
      
      if (bestWeek.weekIndex >= 0) {
        individual[orderNumber] = {
          weekIndex: bestWeek.weekIndex,
          operationsAssignment: bestWeek.operationsAssignment
        };
        
        // Update capacity tracker
        this.updateCapacityTracker(capacityTracker, order, bestWeek.weekIndex, bestWeek.operationsAssignment);
      } else {
        // Fallback: assign to target week (will be penalized in fitness)
        individual[orderNumber] = {
          weekIndex: targetWeekIndex,
          operationsAssignment: this.assignOperations(orderNumber)
        };
      }
    }

    return individual;
  }

  sortOrdersByPriority(orderNumbers) {
    const priorityOrder = this.getDynamicPriorityOrder();
    
    return orderNumbers.sort((a, b) => {
      const orderA = this.system.salesOrders.get(a);
      const orderB = this.system.salesOrders.get(b);
      
      if (!orderA || !orderB) return 0;
      
      // Sort by priority first
      const priorityA = priorityOrder[orderA.customerPriority] || 999;
      const priorityB = priorityOrder[orderB.customerPriority] || 999;
      const priorityDiff = priorityA - priorityB;
      
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by promise date
      return moment(orderA.orderPromiseDate).diff(moment(orderB.orderPromiseDate));
    });
  }

  getDynamicPriorityOrder() {
    const priorities = new Set();
    
    // Collect all unique priorities from sales orders
    for (const order of this.system.salesOrders.values()) {
      if (order && order.customerPriority) {
        priorities.add(order.customerPriority);
      }
    }
    
    const priorityArray = Array.from(priorities);
    const priorityOrder = {};
    
    // Create dynamic ordering based on priority delivery criteria
    priorityArray.sort((a, b) => {
      const criteriaA = this.system.getPriorityDeliveryCriteria(a);
      const criteriaB = this.system.getPriorityDeliveryCriteria(b);
      
      // Sort by maxDelayDays (ascending), then by penaltyMultiplier (descending)
      if (criteriaA.maxDelayDays !== criteriaB.maxDelayDays) {
        return criteriaA.maxDelayDays - criteriaB.maxDelayDays;
      }
      return criteriaB.penaltyMultiplier - criteriaA.penaltyMultiplier;
    });
    
    // Assign order numbers
    priorityArray.forEach((priority, index) => {
      priorityOrder[priority] = index;
    });
    
    return priorityOrder;
  }

  initializeCapacityTracker() {
    const tracker = {};
    
    // Use actual line restrictions from the system
    for (const [lineName, restriction] of this.system.lineRestrictions.entries()) {
      if (restriction && restriction.validity !== false) {
        tracker[lineName] = {};
        
        for (let weekIndex = 0; weekIndex < this.system.weeks.length; weekIndex++) {
          const week = this.system.weeks[weekIndex];
          const capacity = restriction.weeklyCapacity && restriction.weeklyCapacity[week] 
            ? parseInt(restriction.weeklyCapacity[week]) || 0
            : 0;
          tracker[lineName][weekIndex] = capacity;
        }
      }
    }
    
    return tracker;
  }

  findBestAvailableWeek(order, targetWeekIndex, capacityTracker) {
    const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(order.orderNumber);
    const priorityCriteria = this.system.getPriorityDeliveryCriteria(order.customerPriority);
    const maxDelayWeeks = Math.ceil(priorityCriteria.maxDelayDays / 7);
    
    // Search range: from earliest allowed to target + max allowed delay
    const searchStart = orderEarliestWeek;
    const searchEnd = Math.min(
      targetWeekIndex + maxDelayWeeks + 2, 
      this.system.weeks.length - 1
    );
    
    // Prefer weeks closer to target date
    const searchOrder = this.createSearchOrder(targetWeekIndex, searchStart, searchEnd);
    
    // Try to find a week with available capacity
    for (const weekIndex of searchOrder) {
      const assignment = this.findCapacityForWeek(order, weekIndex, capacityTracker);
      if (assignment) {
        return {
          weekIndex: weekIndex,
          operationsAssignment: assignment
        };
      }
    }
    
    // No capacity found
    return { weekIndex: -1, operationsAssignment: {} };
  }

  createSearchOrder(targetWeekIndex, searchStart, searchEnd) {
    const searchOrder = [];
    
    // Add target week first
    if (targetWeekIndex >= searchStart && targetWeekIndex <= searchEnd) {
      searchOrder.push(targetWeekIndex);
    }
    
    // Add weeks around target (±1, ±2, ±3, etc.)
    for (let offset = 1; offset <= Math.max(targetWeekIndex - searchStart, searchEnd - targetWeekIndex); offset++) {
      if (targetWeekIndex - offset >= searchStart) {
        searchOrder.push(targetWeekIndex - offset);
      }
      if (targetWeekIndex + offset <= searchEnd) {
        searchOrder.push(targetWeekIndex + offset);
      }
    }
    
    return searchOrder;
  }

  findCapacityForWeek(order, weekIndex, capacityTracker) {
    if (!order || !order.operations) return null;
    
    const assignment = {};
    let allOperationsCanFit = true;
    
    for (const operationId of order.operations) {
      const operation = this.system.operations.get(operationId);
      if (!operation) continue;
      
      const availableLines = [operation.primaryLineRestriction, ...operation.alternateLineRestrictions];
      let lineFound = false;
      
      // Try primary line first, then alternates
      for (const lineName of availableLines) {
        const availableCapacity = capacityTracker[lineName] && capacityTracker[lineName][weekIndex] !== undefined 
          ? capacityTracker[lineName][weekIndex] 
          : 0;
        
        if (availableCapacity >= (order.orderQty || 0)) {
          assignment[operationId] = lineName;
          lineFound = true;
          break;
        }
      }
      
      if (!lineFound) {
        allOperationsCanFit = false;
        break;
      }
    }
    
    return allOperationsCanFit ? assignment : null;
  }

  updateCapacityTracker(capacityTracker, order, weekIndex, operationsAssignment) {
    for (const [operationId, lineName] of Object.entries(operationsAssignment)) {
      if (capacityTracker[lineName] && capacityTracker[lineName][weekIndex] !== undefined) {
        capacityTracker[lineName][weekIndex] -= (order.orderQty || 0);
        capacityTracker[lineName][weekIndex] = Math.max(0, capacityTracker[lineName][weekIndex]);
      }
    }
  }

  assignOperations(orderNumber) {
    const order = this.system.salesOrders.get(orderNumber);
    if (!order || !order.operations) return {};
    
    const assignment = {};

    for (const operationId of order.operations) {
      const operation = this.system.operations.get(operationId);
      if (operation) {
        const availableLines = [operation.primaryLineRestriction, ...operation.alternateLineRestrictions];
        assignment[operationId] = availableLines[Math.floor(Math.random() * availableLines.length)];
      }
    }

    return assignment;
  }

  calculateFitness(individual) {
    let totalPenalty = 0.0;
    const capacityUsage = {};
    const earliestWeek = this.system.getEarliestSchedulableWeekIndex();

    // Initialize capacity tracking
    for (const [lineName] of this.system.lineRestrictions.keys()) {
      capacityUsage[lineName] = {};
    }

    for (const [orderNumber, assignment] of Object.entries(individual)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (!order) continue;

      const weekIndex = assignment.weekIndex;

      // Past scheduling penalty
      if (weekIndex < earliestWeek) {
        totalPenalty += 50000;
        continue;
      }

      // Too early scheduling penalty
      const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
      if (weekIndex < orderEarliestWeek) {
        totalPenalty += 25000;
        continue;
      }

      if (weekIndex >= this.system.weeks.length) {
        totalPenalty += 10000;
        continue;
      }

      const scheduledWeek = this.system.weeks[weekIndex];
      const scheduledDate = this.weekToDate(scheduledWeek);
      const promiseDate = moment(order.orderPromiseDate);
      const daysDifference = scheduledDate.diff(promiseDate, 'days');
      const weeksDifference = Math.floor(Math.abs(daysDifference) / 7);
      
      // Priority-based timing penalties
      if (daysDifference > 0) {
        const priorityCriteria = this.system.getPriorityDeliveryCriteria(order.customerPriority);
        const isDelayAcceptable = daysDifference <= priorityCriteria.maxDelayDays;
        
        if (!isDelayAcceptable) {
          const excessDelayDays = daysDifference - priorityCriteria.maxDelayDays;
          const priorityViolationPenalty = excessDelayDays * 200 * priorityCriteria.penaltyMultiplier;
          totalPenalty += priorityViolationPenalty;
        }
        
        const penaltyKey = `${order.customerPriority}_${order.productId}`;
        const penaltyRule = this.system.penaltyRules.get(penaltyKey);
        if (penaltyRule) {
          const latePenalty = penaltyRule.lateDeliveryPenalty * Math.pow(weeksDifference + 1, 1.5) * priorityCriteria.penaltyMultiplier;
          totalPenalty += latePenalty;
        }
      } else if (daysDifference === 0) {
        totalPenalty -= this.perfectTimingBonus;
      } else if (daysDifference >= -this.system.minEarlyDeliveryDays) {
        totalPenalty -= Math.max(10, 30 - Math.abs(daysDifference));
      } else {
        totalPenalty += 1000 * weeksDifference;
      }

      // Capacity constraint penalties
      for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
        if (!capacityUsage[lineRestriction]) {
          capacityUsage[lineRestriction] = {};
        }
        if (!capacityUsage[lineRestriction][weekIndex]) {
          capacityUsage[lineRestriction][weekIndex] = 0;
        }
        
        capacityUsage[lineRestriction][weekIndex] += (order.orderQty || 0);

        const restriction = this.system.lineRestrictions.get(lineRestriction);
        if (restriction) {
          const availableCapacity = restriction.weeklyCapacity && restriction.weeklyCapacity[scheduledWeek] 
            ? parseInt(restriction.weeklyCapacity[scheduledWeek]) || 0
            : 0;
          
          if (capacityUsage[lineRestriction][weekIndex] > availableCapacity) {
            const excess = capacityUsage[lineRestriction][weekIndex] - availableCapacity;
            const capacityPenalty = restriction.penaltyCost * Math.pow(excess, 1.5);
            totalPenalty += capacityPenalty;
          }
        }
      }

      // Component availability penalties
      if (order.components) {
        for (const [component, requiredQty] of Object.entries(order.components)) {
          const availability = this.system.componentAvailability.get(component);
          if (availability) {
            const available = availability.weeklyAvailability && availability.weeklyAvailability[scheduledWeek] 
              ? parseInt(availability.weeklyAvailability[scheduledWeek]) || 0
              : 0;
            if ((requiredQty || 0) > available) {
              totalPenalty += ((requiredQty || 0) - available) * 50;
            }
          }
        }
      }
    }

    return Math.max(0, 100000 - totalPenalty);
  }

  crossover(parent1, parent2) {
    const orders = Object.keys(parent1);
    const crossoverPoint = Math.floor(Math.random() * (orders.length - 1)) + 1;

    const child1 = {};
    const child2 = {};

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      if (i < crossoverPoint) {
        child1[order] = { ...parent1[order] };
        child2[order] = { ...parent2[order] };
      } else {
        child1[order] = { ...parent2[order] };
        child2[order] = { ...parent1[order] };
      }
    }

    return [child1, child2];
  }

  mutate(individual) {
    const earliestWeek = this.system.getEarliestSchedulableWeekIndex();

    for (const orderNumber of Object.keys(individual)) {
      if (Math.random() < this.mutationRate) {
        const order = this.system.salesOrders.get(orderNumber);
        if (!order) continue;
        
        const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
        
        // Calculate target week for intelligent mutation
        const promiseDate = moment(order.orderPromiseDate);
        const promiseWeek = `W${promiseDate.format('YYYY-WW')}`;
        let targetWeekIndex = this.system.weeks.indexOf(promiseWeek);
        
        if (targetWeekIndex < 0) {
          targetWeekIndex = Math.max(orderEarliestWeek, earliestWeek + 2);
        }
        
        targetWeekIndex = Math.max(targetWeekIndex, orderEarliestWeek);
        
        // 60% chance for intelligent mutation (near promise date), 40% random
        if (Math.random() < 0.6) {
          const priorityCriteria = this.system.getPriorityDeliveryCriteria(order.customerPriority);
          
          let maxVarianceWeeks = this.timingVarianceWeeks;
          if (priorityCriteria.maxDelayDays === 0) {
            // Critical/High priority: prefer early or exact timing
            maxVarianceWeeks = Math.min(2, this.timingVarianceWeeks);
            const variance = Math.floor(Math.random() * (maxVarianceWeeks + 1)) - maxVarianceWeeks;
            individual[orderNumber].weekIndex = Math.max(targetWeekIndex + variance, orderEarliestWeek);
          } else {
            // Medium/Low priority: allow some positive variance
            const maxDelayWeeks = Math.ceil(priorityCriteria.maxDelayDays / 7);
            const variance = Math.floor(Math.random() * (maxVarianceWeeks + maxDelayWeeks + 1)) - maxVarianceWeeks;
            const newWeekIndex = targetWeekIndex + variance;
            individual[orderNumber].weekIndex = Math.max(newWeekIndex, orderEarliestWeek);
          }
        } else {
          // Random mutation
          const maxWeek = Math.min(earliestWeek + 20, this.system.weeks.length - 1);
          individual[orderNumber].weekIndex = Math.floor(Math.random() * (maxWeek - orderEarliestWeek + 1)) + orderEarliestWeek;
        }
        
        // Ensure week index is within bounds
        individual[orderNumber].weekIndex = Math.min(individual[orderNumber].weekIndex, this.system.weeks.length - 1);
      }

      if (Math.random() < this.mutationRate) {
        individual[orderNumber].operationsAssignment = this.assignOperations(orderNumber);
      }
    }
  }

  tournamentSelection(population, fitnessScores) {
    const tournamentIndices = [];
    for (let i = 0; i < this.tournamentSize; i++) {
      tournamentIndices.push(Math.floor(Math.random() * population.length));
    }

    let bestIndex = tournamentIndices[0];
    let bestFitness = fitnessScores[bestIndex];

    for (let i = 1; i < tournamentIndices.length; i++) {
      const index = tournamentIndices[i];
      if (fitnessScores[index] > bestFitness) {
        bestFitness = fitnessScores[index];
        bestIndex = index;
      }
    }

    return population[bestIndex];
  }

  weekToDate(weekStr) {
    try {
      const [year, week] = weekStr.substring(1).split('-');
      return moment().year(parseInt(year)).week(parseInt(week)).startOf('week');
    } catch (error) {
      return moment();
    }
  }

  async optimize() {
    // this.logger.info('Starting genetic algorithm optimization...');
    console.log('Starting genetic algorithm optimization...');
    // Initialize population
    let population = [];
    for (let i = 0; i < this.populationSize; i++) {
      if (this.cancelled) {
        throw new Error('Optimization was cancelled');
      }
      population.push(this.createIndividual());
    }

    const fitnessHistory = [];
    let bestSolution = null;
    let bestFitness = -Infinity;

    for (let generation = 0; generation < this.generations; generation++) {
      await new Promise(resolve => setImmediate(resolve));
      if (this.cancelled) {
        console.log(`🛑 Optimization cancelled at generation ${generation + 1}`);
        throw new Error('Optimization was cancelled');
      };
      // Calculate fitness for all individuals
      const fitnessScores = population.map(individual => 
        {
          if (this.cancelled) {
            throw new Error('Optimization was cancelled');
          }
          return  this.calculateFitness(individual)
        });
      
      const currentBestFitness = Math.max(...fitnessScores);
      fitnessHistory.push(currentBestFitness);

      // Update best solution
      if (currentBestFitness > bestFitness) {
        bestFitness = currentBestFitness;
        const bestIndex = fitnessScores.indexOf(currentBestFitness);
        bestSolution = _.cloneDeep(population[bestIndex]);
      }

      // this.logger.info(`Generation ${generation + 1}/${this.generations}, Best Fitness: ${currentBestFitness.toFixed(2)}`);
      console.log(`Generation ${generation + 1}/${this.generations}, Best Fitness: ${currentBestFitness.toFixed(2)}`);
      if (this.cancelled) {
        console.log(`🛑 Optimization cancelled at generation ${generation + 1}`);
        throw new Error('Optimization was cancelled');
      }
      // Create new population
      const newPopulation = [];

      // Elitism - keep best individual
      const bestIndex = fitnessScores.indexOf(currentBestFitness);
      newPopulation.push(_.cloneDeep(population[bestIndex]));

      // Generate rest of population
      while (newPopulation.length < this.populationSize) {
        if (this.cancelled) {
          throw new Error('Optimization was cancelled');
        }
        const parent1 = this.tournamentSelection(population, fitnessScores);
        const parent2 = this.tournamentSelection(population, fitnessScores);

        let child1, child2;
        if (Math.random() < this.crossoverRate) {
          [child1, child2] = this.crossover(parent1, parent2);
        } else {
          child1 = _.cloneDeep(parent1);
          child2 = _.cloneDeep(parent2);
        }

        this.mutate(child1);
        this.mutate(child2);

        newPopulation.push(child1, child2);
      }

      population = newPopulation.slice(0, this.populationSize);
    }
    if (this.cancelled) {
      throw new Error('Optimization was cancelled');
    }
    // this.logger.info(`Optimization completed. Best fitness: ${bestFitness.toFixed(2)}`);
    console.log(`Optimization completed. Best fitness: ${bestFitness.toFixed(2)}`);
    return {
      bestSolution,
      fitnessHistory,
      finalFitness: bestFitness
    };
  }
}

module.exports = GeneticAlgorithmOptimizer;