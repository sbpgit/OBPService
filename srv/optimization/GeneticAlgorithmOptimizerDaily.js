const _ = require('lodash');
const moment = require('moment');
const path = require('path');
const Logger = require(path.resolve(__dirname, '../utils/Logger'));

class GeneticAlgorithmOptimizerDaily {
  constructor(planningSystem, options = {}) {
    this.system = planningSystem;
    this.populationSize = options.populationSize || 100;
    this.generations = options.generations || 50;
    this.mutationRate = options.mutationRate || 0.1;
    this.crossoverRate = options.crossoverRate || 0.8;
    this.tournamentSize = options.tournamentSize || 3;
    
    this.promiseDatePreference = options.promiseDatePreference || 0.7;
    this.timingVarianceDays = options.timingVarianceDays || 7; // Changed from weeks to days
    this.unnecessaryDelayPenalty = options.unnecessaryDelayPenalty || 100;
    this.perfectTimingBonus = options.perfectTimingBonus || 50;
    
    // NEW: Under-utilization penalty settings
    this.enableUnderUtilizationPenalty = options.enableUnderUtilizationPenalty !== false;
    this.underUtilizationWeight = options.underUtilizationWeight || 0.3;
  }

  cancel() {
    this.cancelled = true;
    console.log("Job Cancellation called");
  }

  createIndividual() {
    const individual = {};
    const capacityTracker = this.initializeCapacityTracker();

    const orderNumbers = Array.from(this.system.salesOrders.keys());
    const sortedOrders = orderNumbers.sort((a, b) => {
      const orderA = this.system.salesOrders.get(a);
      const orderB = this.system.salesOrders.get(b);

      const priorityOrder = this.getDynamicPriorityOrder();
      const priorityDiff = (priorityOrder[orderA.customerPriority] || 4) - (priorityOrder[orderB.customerPriority] || 4);

      if (priorityDiff !== 0) return priorityDiff;
      return moment(orderA.orderPromiseDate).diff(moment(orderB.orderPromiseDate));
    });

    for (const orderNumber of sortedOrders) {
      const order = this.system.salesOrders.get(orderNumber);
      const orderEarliestDay = this.system.getEarliestSchedulableDayForOrder(orderNumber);

      // Calculate target day (promise date day)
      const promiseDate = moment(order.orderPromiseDate);
      let targetDayIndex = this.system.dateToIndexDay(promiseDate.format('YYYY-MM-DD'));

      if (targetDayIndex < 0) {
        targetDayIndex = Math.max(orderEarliestDay, this.system.getEarliestSchedulableDayIndex() + 7);
      }

      targetDayIndex = Math.max(targetDayIndex, orderEarliestDay);

      // Find the best day with available capacity
      const bestDay = this.findBestAvailableDay(order, targetDayIndex, capacityTracker);

      if (bestDay.dayIndex >= 0) {
        individual[orderNumber] = {
          dayIndex: bestDay.dayIndex,
          operationsAssignment: bestDay.operationsAssignment
        };

        this.updateCapacityTracker(capacityTracker, order, bestDay.dayIndex, bestDay.operationsAssignment);
      } else {
        // Fallback: assign to earliest possible day (will be penalized in fitness)
        individual[orderNumber] = {
          dayIndex: targetDayIndex,
          operationsAssignment: this.assignOperations(orderNumber)
        };
      }
    }

    return individual;
  }

  assignOperations(orderNumber) {
    const order = this.system.salesOrders.get(orderNumber);
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
    const earliestDay = this.system.getEarliestSchedulableDayIndex();

    for (const [lineName] of this.system.lineRestrictions) {
      capacityUsage[lineName] = {};
    }

    let severeCapacityViolations = 0;
    let totalCapacityViolations = 0;

    for (const [orderNumber, assignment] of Object.entries(individual)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (!order) continue;

      const dayIndex = assignment.dayIndex;

      // STRICT: Never allow past scheduling
      if (dayIndex < earliestDay) {
        totalPenalty += 100000; // Massive penalty for past scheduling
        continue;
      }

      const orderEarliestDay = this.system.getEarliestSchedulableDayForOrder(orderNumber);
      if (dayIndex < orderEarliestDay) {
        totalPenalty += 50000; // Large penalty for violating order constraints
        continue;
      }

      if (dayIndex >= this.system.dailyBuckets.length) {
        totalPenalty += 25000; // Penalty for scheduling beyond horizon
        continue;
      }

      const scheduledDate = this.system.dayIndexToDate(dayIndex);
      const promiseDate = moment(order.orderPromiseDate);
      const daysDifference = scheduledDate.diff(promiseDate, 'days');

      // Priority-based delay checking
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
          const daysDivided = Math.max(1, Math.floor(daysDifference / 7)); // Convert to weeks for penalty calculation
          const latePenalty = penaltyRule.lateDeliveryPenalty * Math.pow(daysDivided + 1, 1.5) * priorityCriteria.penaltyMultiplier;
          totalPenalty += latePenalty;
        }
      } else if (daysDifference === 0) {
        totalPenalty -= this.perfectTimingBonus;
      } else if (daysDifference >= -this.system.minEarlyDeliveryDays) {
        totalPenalty -= Math.max(10, 30 - Math.abs(daysDifference));
      } else {
        totalPenalty += 1000 * Math.abs(Math.floor(daysDifference / 7));
      }

      // Capacity constraint penalties
      const scheduledDateStr = scheduledDate.format('YYYY-MM-DD');
      for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
        if (!capacityUsage[lineRestriction]) {
          capacityUsage[lineRestriction] = {};
        }
        if (!capacityUsage[lineRestriction][dayIndex]) {
          capacityUsage[lineRestriction][dayIndex] = 0;
        }

        capacityUsage[lineRestriction][dayIndex] += order.orderQty;

        const restriction = this.system.lineRestrictions.get(lineRestriction);
        if (restriction) {
          const availableCapacity = restriction.dailyCapacity[scheduledDateStr] || 0;
          if (capacityUsage[lineRestriction][dayIndex] > availableCapacity) {
            const excess = capacityUsage[lineRestriction][dayIndex] - availableCapacity;
            const capacityPenalty = restriction.penaltyCost * Math.pow(excess, 1.5);
            totalPenalty += capacityPenalty;

            totalCapacityViolations += excess;

            if (excess >= availableCapacity) {
              severeCapacityViolations++;
              totalPenalty += 5000;
            }
          }
        }
      }

      // Component availability penalties
      for (const [component, requiredQty] of Object.entries(order.components)) {
        const availability = this.system.componentAvailability.get(component);
        if (availability) {
          const available = availability.dailyAvailability[scheduledDateStr] || 0;
          if (requiredQty > available) {
            totalPenalty += (requiredQty - available) * 50;
          }
        }
      }
    }

    // NEW: Calculate under-utilization penalties
    if (this.enableUnderUtilizationPenalty) {
      const underUtilizationPenalty = this.calculateUnderUtilizationPenalties(capacityUsage);
      totalPenalty += underUtilizationPenalty * this.underUtilizationWeight;
    }

    // Additional penalties for poor capacity utilization patterns
    if (severeCapacityViolations > 0) {
      totalPenalty += severeCapacityViolations * 2000;
    }

    if (totalCapacityViolations > 10) {
      totalPenalty += totalCapacityViolations * 100;
    }

    return Math.max(0, 100000 - totalPenalty);
  }

  // NEW: Calculate under-utilization penalties across all lines and days
  calculateUnderUtilizationPenalties(capacityUsage) {
    let totalUnderUtilizationPenalty = 0;

    for (const [lineName, restriction] of this.system.lineRestrictions) {
      if (!restriction.dailyCapacity) continue;

      for (let dayIndex = 0; dayIndex < Math.min(90, this.system.dailyBuckets.length); dayIndex++) { // Check first 90 days
        const day = this.system.dailyBuckets[dayIndex];
        const maxCapacity = restriction.dailyCapacity[day.date] || 0;
        const actualUsage = capacityUsage[lineName] && capacityUsage[lineName][dayIndex] || 0;

        if (maxCapacity > 0) {
          const penaltyForDay = this.system.calculateUnderUtilizationPenalty(dayIndex, actualUsage, maxCapacity);
          totalUnderUtilizationPenalty += penaltyForDay;
        }
      }
    }

    return totalUnderUtilizationPenalty;
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
    const earliestDay = this.system.getEarliestSchedulableDayIndex();
    const capacityTracker = this.calculateCurrentCapacityUsage(individual);

    for (const orderNumber of Object.keys(individual)) {
      if (Math.random() < this.mutationRate) {
        const order = this.system.salesOrders.get(orderNumber);
        const orderEarliestDay = this.system.getEarliestSchedulableDayForOrder(orderNumber);
        const currentAssignment = individual[orderNumber];

        this.removeFromCapacityTracker(capacityTracker, order, currentAssignment.dayIndex, currentAssignment.operationsAssignment);

        const promiseDate = moment(order.orderPromiseDate);
        let targetDayIndex = this.system.dateToIndexDay(promiseDate.format('YYYY-MM-DD'));

        if (targetDayIndex < 0) {
          targetDayIndex = Math.max(orderEarliestDay, earliestDay + 7);
        }

        targetDayIndex = Math.max(targetDayIndex, orderEarliestDay);

        // 70% chance for intelligent mutation (capacity-aware), 30% random
        if (Math.random() < 0.7) {
          const betterDay = this.findBestAvailableDay(order, targetDayIndex, capacityTracker);

          if (betterDay.dayIndex >= 0) {
            individual[orderNumber] = {
              dayIndex: betterDay.dayIndex,
              operationsAssignment: betterDay.operationsAssignment
            };

            this.updateCapacityTracker(capacityTracker, order, betterDay.dayIndex, betterDay.operationsAssignment);
          } else {
            individual[orderNumber] = currentAssignment;
            this.updateCapacityTracker(capacityTracker, order, currentAssignment.dayIndex, currentAssignment.operationsAssignment);
          }
        } else {
          // Random mutation - but still check capacity and never go to past
          const maxDay = Math.min(earliestDay + 140, this.system.dailyBuckets.length - 1); // Max 140 days out
          let attempts = 0;
          let newDayIndex;
          let newAssignment;

          do {
            newDayIndex = Math.floor(Math.random() * (maxDay - orderEarliestDay + 1)) + orderEarliestDay;
            newAssignment = this.findCapacityForDay(order, newDayIndex, capacityTracker);
            attempts++;
          } while (!newAssignment && attempts < 10);

          if (newAssignment) {
            individual[orderNumber] = {
              dayIndex: newDayIndex,
              operationsAssignment: newAssignment
            };
            this.updateCapacityTracker(capacityTracker, order, newDayIndex, newAssignment);
          } else {
            individual[orderNumber] = currentAssignment;
            this.updateCapacityTracker(capacityTracker, order, currentAssignment.dayIndex, currentAssignment.operationsAssignment);
          }
        }
      }

      // Mutate operation assignments with capacity awareness
      if (Math.random() < this.mutationRate * 0.5) {
        const order = this.system.salesOrders.get(orderNumber);
        const dayIndex = individual[orderNumber].dayIndex;
        const newAssignment = this.findCapacityForDay(order, dayIndex, capacityTracker);

        if (newAssignment) {
          this.removeFromCapacityTracker(capacityTracker, order, dayIndex, individual[orderNumber].operationsAssignment);
          individual[orderNumber].operationsAssignment = newAssignment;
          this.updateCapacityTracker(capacityTracker, order, dayIndex, newAssignment);
        }
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

  async optimize() {
    console.log('Starting genetic algorithm optimization with daily capacity and under-utilization penalties...');

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
      }

      const fitnessScores = population.map(individual => {
        if (this.cancelled) {
          throw new Error('Optimization was cancelled');
        }
        return this.calculateFitness(individual);
      });

      const currentBestFitness = Math.max(...fitnessScores);
      fitnessHistory.push(currentBestFitness);

      if (currentBestFitness > bestFitness) {
        bestFitness = currentBestFitness;
        const bestIndex = fitnessScores.indexOf(currentBestFitness);
        bestSolution = _.cloneDeep(population[bestIndex]);
      }

      console.log(`Generation ${generation + 1}/${this.generations}, Best Fitness: ${currentBestFitness.toFixed(2)}`);

      if (this.cancelled) {
        console.log(`🛑 Optimization cancelled at generation ${generation + 1}`);
        throw new Error('Optimization was cancelled');
      }

      const newPopulation = [];
      const bestIndex = fitnessScores.indexOf(currentBestFitness);
      newPopulation.push(_.cloneDeep(population[bestIndex]));

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

    console.log(`Optimization completed. Best fitness: ${bestFitness.toFixed(2)}`);
    return {
      bestSolution,
      fitnessHistory,
      finalFitness: bestFitness
    };
  }

  // Helper methods updated for daily buckets
  initializeCapacityTracker() {
    const tracker = {};

    for (const [lineName, restriction] of this.system.lineRestrictions.entries()) {
      if (restriction && restriction.validity !== false) {
        tracker[lineName] = {};

        for (let dayIndex = 0; dayIndex < this.system.dailyBuckets.length; dayIndex++) {
          const day = this.system.dailyBuckets[dayIndex];
          const capacity = restriction.dailyCapacity && restriction.dailyCapacity[day.date]
            ? restriction.dailyCapacity[day.date]
            : 0;
          tracker[lineName][dayIndex] = capacity;
        }
      }
    }

    return tracker;
  }

  findBestAvailableDay(order, targetDayIndex, capacityTracker) {
    const orderEarliestDay = this.system.getEarliestSchedulableDayForOrder(order.orderNumber);
    const priorityCriteria = this.system.getPriorityDeliveryCriteria(order.customerPriority);
    const maxDelayDays = priorityCriteria.maxDelayDays;

    const searchStart = orderEarliestDay;
    const searchEnd = Math.min(
      targetDayIndex + maxDelayDays + 7,
      this.system.dailyBuckets.length - 1
    );

    const searchOrder = [];

    if (targetDayIndex >= searchStart && targetDayIndex <= searchEnd) {
      searchOrder.push(targetDayIndex);
    }

    for (let offset = 1; offset <= Math.max(targetDayIndex - searchStart, searchEnd - targetDayIndex); offset++) {
      if (targetDayIndex - offset >= searchStart) {
        searchOrder.push(targetDayIndex - offset);
      }
      if (targetDayIndex + offset <= searchEnd) {
        searchOrder.push(targetDayIndex + offset);
      }
    }

    for (const dayIndex of searchOrder) {
      const assignment = this.findCapacityForDay(order, dayIndex, capacityTracker);
      if (assignment) {
        return {
          dayIndex: dayIndex,
          operationsAssignment: assignment
        };
      }
    }

    return { dayIndex: -1, operationsAssignment: {} };
  }

  findCapacityForDay(order, dayIndex, capacityTracker) {
    const assignment = {};
    let allOperationsCanFit = true;

    for (const operationId of order.operations) {
      const operation = this.system.operations.get(operationId);
      if (!operation) continue;

      const availableLines = [operation.primaryLineRestriction, ...operation.alternateLineRestrictions];
      let lineFound = false;

      for (const lineName of availableLines) {
        const availableCapacity = capacityTracker[lineName] && capacityTracker[lineName][dayIndex] || 0;

        if (availableCapacity >= order.orderQty) {
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

  updateCapacityTracker(capacityTracker, order, dayIndex, operationsAssignment) {
    for (const [operationId, lineName] of Object.entries(operationsAssignment)) {
      if (capacityTracker[lineName] && capacityTracker[lineName][dayIndex] !== undefined) {
        capacityTracker[lineName][dayIndex] -= order.orderQty;
      }
    }
  }

  calculateCurrentCapacityUsage(individual) {
    const capacityTracker = this.initializeCapacityTracker();

    for (const [orderNumber, assignment] of Object.entries(individual)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (order) {
        this.removeFromCapacityTracker(capacityTracker, order, assignment.dayIndex, assignment.operationsAssignment);
      }
    }

    return capacityTracker;
  }

  removeFromCapacityTracker(capacityTracker, order, dayIndex, operationsAssignment) {
    for (const [operationId, lineName] of Object.entries(operationsAssignment)) {
      if (capacityTracker[lineName] && capacityTracker[lineName][dayIndex] !== undefined) {
        capacityTracker[lineName][dayIndex] += order.orderQty;
      }
    }
  }

  getDynamicPriorityOrder() {
    const priorities = new Set();

    for (const order of this.system.salesOrders.values()) {
      priorities.add(order.customerPriority);
    }

    const priorityArray = Array.from(priorities);
    const priorityOrder = {};

    priorityArray.sort((a, b) => {
      const criteriaA = this.system.getPriorityDeliveryCriteria(a);
      const criteriaB = this.system.getPriorityDeliveryCriteria(b);

      if (criteriaA.maxDelayDays !== criteriaB.maxDelayDays) {
        return criteriaA.maxDelayDays - criteriaB.maxDelayDays;
      }
      return criteriaB.penaltyMultiplier - criteriaA.penaltyMultiplier;
    });

    priorityArray.forEach((priority, index) => {
      priorityOrder[priority] = index;
    });

    return priorityOrder;
  }
}

module.exports = GeneticAlgorithmOptimizerDaily;