// src/optimization/GeneticAlgorithmOptimizer.js
const _ = require('lodash');
const moment = require('moment');
const path = require('path');
const Logger = require(path.resolve(__dirname,'../utils/Logger'));

class GeneticAlgorithmOptimizer {
  constructor(planningSystem, options = {}) {
    this.system = planningSystem;
    this.populationSize = options.populationSize || 100;
    this.generations = options.generations || 50;
    this.mutationRate = options.mutationRate || 0.1;
    this.crossoverRate = options.crossoverRate || 0.8;
    this.tournamentSize = options.tournamentSize || 3;
    this.logger = Logger.getInstance();
  }

  createIndividual() {
    const individual = {};
    const earliestWeek = this.system.getEarliestSchedulableWeekIndex();
    const maxWeek = Math.min(earliestWeek + 20, this.system.weeks.length - 1);

    for (const orderNumber of this.system.salesOrders.keys()) {
      const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
      const weekIndex = Math.floor(Math.random() * (maxWeek - orderEarliestWeek + 1)) + orderEarliestWeek;
      
      individual[orderNumber] = {
        weekIndex: weekIndex,
        operationsAssignment: this.assignOperations(orderNumber)
      };
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
    const earliestWeek = this.system.getEarliestSchedulableWeekIndex();

    // Initialize capacity tracking
    for (const [lineName] of this.system.lineRestrictions) {
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

      // Late delivery penalty
      const daysDifference = scheduledDate.diff(promiseDate, 'days');
      if (daysDifference > 0) {
        const penaltyKey = `${order.customerPriority}_${order.productId}`;
        const penaltyRule = this.system.penaltyRules.get(penaltyKey);
        if (penaltyRule) {
          const weeksLate = Math.max(1, Math.floor(daysDifference / 7));
          totalPenalty += penaltyRule.lateDeliveryPenalty * weeksLate;
        }
      } else if (daysDifference >= -this.system.minEarlyDeliveryDays && daysDifference <= 0) {
        // Optimal timing bonus
        totalPenalty -= 5;
      }

      // Capacity constraint penalties
      for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
        if (!capacityUsage[lineRestriction]) {
          capacityUsage[lineRestriction] = {};
        }
        if (!capacityUsage[lineRestriction][weekIndex]) {
          capacityUsage[lineRestriction][weekIndex] = 0;
        }
        
        capacityUsage[lineRestriction][weekIndex] += order.orderQty;

        const restriction = this.system.lineRestrictions.get(lineRestriction);
        if (restriction) {
          const availableCapacity = restriction.weeklyCapacity[scheduledWeek] || 0;
          if (capacityUsage[lineRestriction][weekIndex] > availableCapacity) {
            const excess = capacityUsage[lineRestriction][weekIndex] - availableCapacity;
            totalPenalty += restriction.penaltyCost * excess;
          }
        }
      }

      // Component availability penalties
      for (const [component, requiredQty] of Object.entries(order.components)) {
        const availability = this.system.componentAvailability.get(component);
        if (availability) {
          const available = availability.weeklyAvailability[scheduledWeek] || 0;
          if (requiredQty > available) {
            totalPenalty += (requiredQty - available) * 50;
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
    const maxWeek = Math.min(earliestWeek + 20, this.system.weeks.length - 1);

    for (const orderNumber of Object.keys(individual)) {
      if (Math.random() < this.mutationRate) {
        const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
        individual[orderNumber].weekIndex = Math.floor(Math.random() * (maxWeek - orderEarliestWeek + 1)) + orderEarliestWeek;
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
    const [year, week] = weekStr.substring(1).split('-');
    return moment().year(parseInt(year)).week(parseInt(week)).startOf('week');
  }

  async optimize() {
    this.logger.info('Starting genetic algorithm optimization...');
    
    // Initialize population
    let population = [];
    for (let i = 0; i < this.populationSize; i++) {
      population.push(this.createIndividual());
    }

    const fitnessHistory = [];
    let bestSolution = null;
    let bestFitness = -Infinity;

    for (let generation = 0; generation < this.generations; generation++) {
      // Calculate fitness for all individuals
      const fitnessScores = population.map(individual => this.calculateFitness(individual));
      
      const currentBestFitness = Math.max(...fitnessScores);
      fitnessHistory.push(currentBestFitness);

      // Update best solution
      if (currentBestFitness > bestFitness) {
        bestFitness = currentBestFitness;
        const bestIndex = fitnessScores.indexOf(currentBestFitness);
        bestSolution = _.cloneDeep(population[bestIndex]);
      }

      this.logger.info(`Generation ${generation + 1}/${this.generations}, Best Fitness: ${currentBestFitness.toFixed(2)}`);

      // Create new population
      const newPopulation = [];

      // Elitism - keep best individual
      const bestIndex = fitnessScores.indexOf(currentBestFitness);
      newPopulation.push(_.cloneDeep(population[bestIndex]));

      // Generate rest of population
      while (newPopulation.length < this.populationSize) {
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

    this.logger.info(`Optimization completed. Best fitness: ${bestFitness.toFixed(2)}`);
    
    return {
      bestSolution,
      fitnessHistory,
      finalFitness: bestFitness
    };
  }
}

module.exports = GeneticAlgorithmOptimizer;