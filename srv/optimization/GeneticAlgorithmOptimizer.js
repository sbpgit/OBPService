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
  //Commented code on 24/06/2025 based on version 3 sent by Ashok
  // createIndividual() {
  //   const individual = {};
  //   const earliestWeek = this.system.getEarliestSchedulableWeekIndex();
  //   //New code added on 23/06/2025- Pradeep
  //   // const maxWeek = Math.min(earliestWeek + 20, this.system.weeks.length - 1);
  //   // for (const orderNumber of this.system.salesOrders.keys()) {
  //   //   const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
  //   //   const weekIndex = Math.floor(Math.random() * (maxWeek - orderEarliestWeek + 1)) + orderEarliestWeek;

  //   //   individual[orderNumber] = {
  //   //     weekIndex: weekIndex,
  //   //     operationsAssignment: this.assignOperations(orderNumber)
  //   //   };
  //   // }
  //   //New code added on 23/06/2025- Pradeep
  //   for (const orderNumber of this.system.salesOrders.keys()) {
  //     const order = this.system.salesOrders.get(orderNumber);
  //     const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);

  //     // Calculate target week (promise date week)
  //     const promiseDate = moment(order.orderPromiseDate);
  //     const promiseWeek = `W${promiseDate.format('YYYY-WW')}`;
  //     let targetWeekIndex = this.system.weeks.indexOf(promiseWeek);

  //     if (targetWeekIndex < 0) {
  //       targetWeekIndex = Math.max(orderEarliestWeek, earliestWeek + 4);
  //     }

  //     targetWeekIndex = Math.max(targetWeekIndex, orderEarliestWeek);
  //     targetWeekIndex = Math.min(targetWeekIndex, this.system.weeks.length - 1);

  //     // 70% chance to schedule near promise date, 30% random exploration
  //     let weekIndex;
  //     // if (Math.random() < this.promiseDatePreference) {
  //     //   const variance = Math.floor(Math.random() * (this.timingVarianceWeeks * 2 + 1)) - this.timingVarianceWeeks;
  //     //   weekIndex = targetWeekIndex + variance;
  //     //   weekIndex = Math.max(weekIndex, orderEarliestWeek);
  //     //   weekIndex = Math.min(weekIndex, Math.min(targetWeekIndex + 8, this.system.weeks.length - 1));
  //     // } 
  //     //New Code added 23/06/2025-Pradeep
  //     if (Math.random() < this.promiseDatePreference) {
  //       const priorityCriteria = this.system.getPriorityDeliveryCriteria(order.customerPriority);

  //       // Adjust variance based on priority
  //       let maxVarianceWeeks = this.timingVarianceWeeks;
  //       if (priorityCriteria.maxDelayDays === 0) {
  //         // Critical/High priority: prefer early or exact timing
  //         maxVarianceWeeks = Math.min(2, this.timingVarianceWeeks);
  //         const variance = Math.floor(Math.random() * (maxVarianceWeeks + 1)) - maxVarianceWeeks; // -2 to 0
  //         weekIndex = targetWeekIndex + variance;
  //       } else {
  //         // Medium/Low priority: allow some positive variance based on max delay
  //         const maxDelayWeeks = Math.ceil(priorityCriteria.maxDelayDays / 7);
  //         const variance = Math.floor(Math.random() * (maxVarianceWeeks + maxDelayWeeks + 1)) - maxVarianceWeeks; // -3 to +2
  //         weekIndex = targetWeekIndex + variance;
  //       }

  //       weekIndex = Math.max(weekIndex, orderEarliestWeek);
  //       weekIndex = Math.min(weekIndex, Math.min(targetWeekIndex + Math.ceil(priorityCriteria.maxDelayDays / 7) + 2, this.system.weeks.length - 1));
  //     }      
  //     else {
  //       const maxWeek = Math.min(earliestWeek + 20, this.system.weeks.length - 1);
  //       weekIndex = Math.floor(Math.random() * (maxWeek - orderEarliestWeek + 1)) + orderEarliestWeek;
  //     }

  //     individual[orderNumber] = {
  //       weekIndex: weekIndex,
  //       operationsAssignment: this.assignOperations(orderNumber)
  //     };
  //   }
  //   //New code added on 23/06/2025- Pradeep
  //   return individual;
  // }

  //New createIndividual function based on version3 sent by Ashok
  createIndividual() {
    const individual = {};
    const capacityTracker = this.initializeCapacityTracker();

    // Sort orders by priority and promise date for better initial allocation
    const orderNumbers = Array.from(this.system.salesOrders.keys());
    const sortedOrders = orderNumbers.sort((a, b) => {
      const orderA = this.system.salesOrders.get(a);
      const orderB = this.system.salesOrders.get(b);

      // Priority order: Critical, High, Medium, Low
      const priorityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
      const priorityDiff = (priorityOrder[orderA.customerPriority] || 4) - (priorityOrder[orderB.customerPriority] || 4);

      if (priorityDiff !== 0) return priorityDiff;

      // Then by promise date
      return moment(orderA.orderPromiseDate).diff(moment(orderB.orderPromiseDate));
    });

    for (const orderNumber of sortedOrders) {
      const order = this.system.salesOrders.get(orderNumber);
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
        // Fallback: assign to earliest possible week (will be penalized in fitness)
        individual[orderNumber] = {
          weekIndex: targetWeekIndex,
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
  //New code added on 23/06/2025- Pradeep
  // calculateFitness(individual) {
  //   let totalPenalty = 0.0;
  //   const capacityUsage = {};
  //   const earliestWeek = this.system.getEarliestSchedulableWeekIndex();

  //   // Initialize capacity tracking
  //   for (const [lineName] of this.system.lineRestrictions) {
  //     capacityUsage[lineName] = {};
  //   }

  //   for (const [orderNumber, assignment] of Object.entries(individual)) {
  //     const order = this.system.salesOrders.get(orderNumber);
  //     if (!order) continue;

  //     const weekIndex = assignment.weekIndex;

  //     // Past scheduling penalty
  //     if (weekIndex < earliestWeek) {
  //       totalPenalty += 50000;
  //       continue;
  //     }

  //     // Too early scheduling penalty
  //     const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
  //     if (weekIndex < orderEarliestWeek) {
  //       totalPenalty += 25000;
  //       continue;
  //     }

  //     if (weekIndex >= this.system.weeks.length) {
  //       totalPenalty += 10000;
  //       continue;
  //     }

  //     const scheduledWeek = this.system.weeks[weekIndex];
  //     const scheduledDate = this.weekToDate(scheduledWeek);
  //     const promiseDate = moment(order.orderPromiseDate);

  //     // Late delivery penalty
  //     const daysDifference = scheduledDate.diff(promiseDate, 'days');
  //     if (daysDifference > 0) {
  //       const penaltyKey = `${order.customerPriority}_${order.productId}`;
  //       const penaltyRule = this.system.penaltyRules.get(penaltyKey);
  //       if (penaltyRule) {
  //         const weeksLate = Math.max(1, Math.floor(daysDifference / 7));
  //         totalPenalty += penaltyRule.lateDeliveryPenalty * weeksLate;
  //       }
  //     } else if (daysDifference >= -this.system.minEarlyDeliveryDays && daysDifference <= 0) {
  //       // Optimal timing bonus
  //       totalPenalty -= 5;
  //     }

  //     // Capacity constraint penalties
  //     for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
  //       if (!capacityUsage[lineRestriction]) {
  //         capacityUsage[lineRestriction] = {};
  //       }
  //       if (!capacityUsage[lineRestriction][weekIndex]) {
  //         capacityUsage[lineRestriction][weekIndex] = 0;
  //       }

  //       capacityUsage[lineRestriction][weekIndex] += order.orderQty;

  //       const restriction = this.system.lineRestrictions.get(lineRestriction);
  //       if (restriction) {
  //         const availableCapacity = restriction.weeklyCapacity[scheduledWeek] || 0;
  //         if (capacityUsage[lineRestriction][weekIndex] > availableCapacity) {
  //           const excess = capacityUsage[lineRestriction][weekIndex] - availableCapacity;
  //           totalPenalty += restriction.penaltyCost * excess;
  //         }
  //       }
  //     }

  //     // Component availability penalties
  //     for (const [component, requiredQty] of Object.entries(order.components)) {
  //       const availability = this.system.componentAvailability.get(component);
  //       if (availability) {
  //         const available = availability.weeklyAvailability[scheduledWeek] || 0;
  //         if (requiredQty > available) {
  //           totalPenalty += (requiredQty - available) * 50;
  //         }
  //       }
  //     }
  //   }

  //   return Math.max(0, 100000 - totalPenalty);
  // }
  //New code added on 23/06/2025- Pradeep
  calculateFitness(individual) {
    let totalPenalty = 0.0;
    const capacityUsage = {};
    const earliestWeek = this.system.getEarliestSchedulableWeekIndex();

    for (const [lineName] of this.system.lineRestrictions) {
      capacityUsage[lineName] = {};
    }

    // NEW: Track severe capacity violations -added on 24/06/2025 Version 3
    let severeCapacityViolations = 0;
    let totalCapacityViolations = 0;
    // const capacityAvailable = this.calculateAvailableCapacity(individual);

    for (const [orderNumber, assignment] of Object.entries(individual)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (!order) continue;

      const weekIndex = assignment.weekIndex;

      if (weekIndex < earliestWeek) {
        totalPenalty += 50000;
        continue;
      }

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

      // if (daysDifference > 0) {
      //   // Late delivery penalty (exponential)
      //   const penaltyKey = `${order.customerPriority}_${order.productId}`;
      //   const penaltyRule = this.system.penaltyRules.get(penaltyKey);
      //   if (penaltyRule) {
      //     const latePenalty = penaltyRule.lateDeliveryPenalty * Math.pow(weeksDifference + 1, 1.5);
      //     totalPenalty += latePenalty;
      //   }
      // } 
      //New code added 23/06/2025- Pradeep
      if (daysDifference > 0) {
        // Priority-based delay checking
        const priorityCriteria = this.system.getPriorityDeliveryCriteria(order.customerPriority);
        const isDelayAcceptable = daysDifference <= priorityCriteria.maxDelayDays;

        if (!isDelayAcceptable) {
          // Unacceptable delay for this priority level
          const excessDelayDays = daysDifference - priorityCriteria.maxDelayDays;
          const priorityViolationPenalty = excessDelayDays * 200 * priorityCriteria.penaltyMultiplier;
          totalPenalty += priorityViolationPenalty;
        }

        // Standard late delivery penalty
        const penaltyKey = `${order.customerPriority}_${order.productId}`;
        const penaltyRule = this.system.penaltyRules.get(penaltyKey);
        if (penaltyRule) {
          const latePenalty = penaltyRule.lateDeliveryPenalty * Math.pow(weeksDifference + 1, 1.5) * priorityCriteria.penaltyMultiplier;
          totalPenalty += latePenalty;
        }
      }
      else if (daysDifference === 0) {
        // Perfect timing bonus
        totalPenalty -= this.perfectTimingBonus;
      } else if (daysDifference >= -this.system.minEarlyDeliveryDays) {
        // Early delivery within allowed window
        totalPenalty -= Math.max(10, 30 - Math.abs(daysDifference));
      } else {
        // Too early
        totalPenalty += 1000 * weeksDifference;
      }

      // NEW: Unnecessary delay penalty
      // if (daysDifference > 7) {
      //   const couldScheduleEarlier = this.canScheduleEarlier(order, weekIndex, promiseDate, capacityAvailable);
      //   if (couldScheduleEarlier) {
      //     totalPenalty += weeksDifference * this.unnecessaryDelayPenalty;
      //   }
      // }

      // Capacity and component penalties (keep existing logic)
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
           // Exponential penalty for capacity violations
          const capacityPenalty = restriction.penaltyCost * Math.pow(excess, 1.5);
          totalPenalty += capacityPenalty;
          
          totalCapacityViolations += excess;
          
          // Track severe violations (exceeding capacity by 100%+)
          if (excess >= availableCapacity) {
            severeCapacityViolations++;
            totalPenalty += 5000; // Additional severe penalty
          }
        }
      }
    }
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

    // NEW: Additional penalty for poor capacity utilization patterns
  if (severeCapacityViolations > 0) {
    totalPenalty += severeCapacityViolations * 2000;
  }
  
  if (totalCapacityViolations > 10) {
    totalPenalty += totalCapacityViolations * 100;
  }

    return Math.max(0, 100000 - totalPenalty);
  }
  //New code added on 23/06/2025- Pradeep
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
  //Commenting code based on version 3 sent by Ashok and replacing with new mutate function - 24/06/2025
  // mutate(individual) {
  //   const earliestWeek = this.system.getEarliestSchedulableWeekIndex();
  //   const maxWeek = Math.min(earliestWeek + 20, this.system.weeks.length - 1);

  //   for (const orderNumber of Object.keys(individual)) {
  //     if (Math.random() < this.mutationRate) {
  //       const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
  //       individual[orderNumber].weekIndex = Math.floor(Math.random() * (maxWeek - orderEarliestWeek + 1)) + orderEarliestWeek;
  //     }

  //     if (Math.random() < this.mutationRate) {
  //       individual[orderNumber].operationsAssignment = this.assignOperations(orderNumber);
  //     }
  //   }
  // }
  mutate(individual) {
    const earliestWeek = this.system.getEarliestSchedulableWeekIndex();
    const capacityTracker = this.calculateCurrentCapacityUsage(individual);

    for (const orderNumber of Object.keys(individual)) {
      if (Math.random() < this.mutationRate) {
        const order = this.system.salesOrders.get(orderNumber);
        const orderEarliestWeek = this.system.getEarliestSchedulableWeekForOrder(orderNumber);
        const currentAssignment = individual[orderNumber];

        // Remove current assignment from capacity tracker
        this.removeFromCapacityTracker(capacityTracker, order, currentAssignment.weekIndex, currentAssignment.operationsAssignment);

        // Calculate target week for intelligent mutation
        const promiseDate = moment(order.orderPromiseDate);
        const promiseWeek = `W${promiseDate.format('YYYY-WW')}`;
        let targetWeekIndex = this.system.weeks.indexOf(promiseWeek);

        if (targetWeekIndex < 0) {
          targetWeekIndex = Math.max(orderEarliestWeek, earliestWeek + 2);
        }

        targetWeekIndex = Math.max(targetWeekIndex, orderEarliestWeek);

        // 70% chance for intelligent mutation (capacity-aware), 30% random
        if (Math.random() < 0.7) {
          // Try to find better week with available capacity
          const betterWeek = this.findBestAvailableWeek(order, targetWeekIndex, capacityTracker);

          if (betterWeek.weekIndex >= 0) {
            individual[orderNumber] = {
              weekIndex: betterWeek.weekIndex,
              operationsAssignment: betterWeek.operationsAssignment
            };

            // Update capacity tracker with new assignment
            this.updateCapacityTracker(capacityTracker, order, betterWeek.weekIndex, betterWeek.operationsAssignment);
          } else {
            // Fallback to current assignment
            individual[orderNumber] = currentAssignment;
            this.updateCapacityTracker(capacityTracker, order, currentAssignment.weekIndex, currentAssignment.operationsAssignment);
          }
        } else {
          // Random mutation - but still check capacity
          const maxWeek = Math.min(earliestWeek + 20, this.system.weeks.length - 1);
          let attempts = 0;
          let newWeekIndex;
          let newAssignment;

          do {
            newWeekIndex = Math.floor(Math.random() * (maxWeek - orderEarliestWeek + 1)) + orderEarliestWeek;
            newAssignment = this.findCapacityForWeek(order, newWeekIndex, capacityTracker);
            attempts++;
          } while (!newAssignment && attempts < 10);

          if (newAssignment) {
            individual[orderNumber] = {
              weekIndex: newWeekIndex,
              operationsAssignment: newAssignment
            };
            this.updateCapacityTracker(capacityTracker, order, newWeekIndex, newAssignment);
          } else {
            // Keep current assignment if no capacity found
            individual[orderNumber] = currentAssignment;
            this.updateCapacityTracker(capacityTracker, order, currentAssignment.weekIndex, currentAssignment.operationsAssignment);
          }
        }
      }

      // Mutate operation assignments with capacity awareness
      if (Math.random() < this.mutationRate * 0.5) {
        const order = this.system.salesOrders.get(orderNumber);
        const weekIndex = individual[orderNumber].weekIndex;
        const newAssignment = this.findCapacityForWeek(order, weekIndex, capacityTracker);

        if (newAssignment) {
          // Remove old assignment
          this.removeFromCapacityTracker(capacityTracker, order, weekIndex, individual[orderNumber].operationsAssignment);
          // Add new assignment
          individual[orderNumber].operationsAssignment = newAssignment;
          this.updateCapacityTracker(capacityTracker, order, weekIndex, newAssignment);
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

  weekToDate(weekStr) {
    const [year, week] = weekStr.substring(1).split('-');
    return moment().year(parseInt(year)).week(parseInt(week)).startOf('week');
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
      const fitnessScores = population.map(individual => {
        if (this.cancelled) {
          throw new Error('Optimization was cancelled');
        }
        return this.calculateFitness(individual)
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
      // Check cancellation before creating new population
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
  //New code added on 23/06/2025- Pradeep
  canScheduleEarlier(order, currentWeekIndex, promiseDate, capacityAvailable) {
    const promiseWeek = `W${promiseDate.format('YYYY-WW')}`;
    const promiseWeekIndex = this.system.weeks.indexOf(promiseWeek);
    const earliestAllowedWeek = this.system.getEarliestSchedulableWeekForOrder(order.orderNumber);

    const targetWeekIndex = Math.max(promiseWeekIndex, earliestAllowedWeek);

    if (targetWeekIndex >= currentWeekIndex) {
      return false;
    }

    for (let weekIdx = targetWeekIndex; weekIdx < currentWeekIndex; weekIdx++) {
      const week = this.system.weeks[weekIdx];
      let canFitInWeek = true;

      for (const operationId of order.operations) {
        const operation = this.system.operations.get(operationId);
        if (operation) {
          const primaryLine = operation.primaryLineRestriction;
          const restriction = this.system.lineRestrictions.get(primaryLine);

          if (restriction) {
            const availableCapacity = restriction.weeklyCapacity[week] || 0;
            const currentUsage = capacityAvailable[primaryLine] && capacityAvailable[primaryLine][weekIdx] || 0;

            if (currentUsage + order.orderQty > availableCapacity) {
              let canUseAlternate = false;
              for (const alternateLine of operation.alternateLineRestrictions) {
                const altRestriction = this.system.lineRestrictions.get(alternateLine);
                if (altRestriction) {
                  const altCapacity = altRestriction.weeklyCapacity[week] || 0;
                  const altUsage = capacityAvailable[alternateLine] && capacityAvailable[alternateLine][weekIdx] || 0;
                  if (altUsage + order.orderQty <= altCapacity) {
                    canUseAlternate = true;
                    break;
                  }
                }
              }
              if (!canUseAlternate) {
                canFitInWeek = false;
                break;
              }
            }
          }
        }
      }

      if (canFitInWeek) {
        return true;
      }
    }

    return false;
  }

  calculateAvailableCapacity(individual) {
    const capacityUsage = {};

    for (const [lineName] of this.system.lineRestrictions) {
      capacityUsage[lineName] = {};
    }

    for (const [orderNumber, assignment] of Object.entries(individual)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (!order) continue;

      const weekIndex = assignment.weekIndex;
      if (weekIndex < 0 || weekIndex >= this.system.weeks.length) continue;

      for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
        if (!capacityUsage[lineRestriction]) {
          capacityUsage[lineRestriction] = {};
        }
        if (!capacityUsage[lineRestriction][weekIndex]) {
          capacityUsage[lineRestriction][weekIndex] = 0;
        }
        capacityUsage[lineRestriction][weekIndex] += order.orderQty;
      }
    }

    return capacityUsage;
  }

  //New functions added based on version 3 code sent by ashok- 24/06/2025
  initializeCapacityTracker() {
    const tracker = {};
    for (const [lineName, restriction] of this.system.lineRestrictions) {
      tracker[lineName] = {};
      for (let weekIndex = 0; weekIndex < this.system.weeks.length; weekIndex++) {
        const week = this.system.weeks[weekIndex];
        tracker[lineName][weekIndex] = restriction.weeklyCapacity[week] || 0;
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

  findCapacityForWeek(order, weekIndex, capacityTracker) {
    const assignment = {};
    let allOperationsCanFit = true;

    for (const operationId of order.operations) {
      const operation = this.system.operations.get(operationId);
      if (!operation) continue;

      const availableLines = [operation.primaryLineRestriction, ...operation.alternateLineRestrictions];
      let lineFound = false;

      // Try primary line first, then alternates
      for (const lineName of availableLines) {
        const availableCapacity = capacityTracker[lineName] && capacityTracker[lineName][weekIndex] || 0;

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

  updateCapacityTracker(capacityTracker, order, weekIndex, operationsAssignment) {
    for (const [operationId, lineName] of Object.entries(operationsAssignment)) {
      if (capacityTracker[lineName] && capacityTracker[lineName][weekIndex] !== undefined) {
        capacityTracker[lineName][weekIndex] -= order.orderQty;
      }
    }
  }

  calculateCurrentCapacityUsage(individual) {
    const capacityTracker = this.initializeCapacityTracker();

    for (const [orderNumber, assignment] of Object.entries(individual)) {
      const order = this.system.salesOrders.get(orderNumber);
      if (order) {
        this.removeFromCapacityTracker(capacityTracker, order, assignment.weekIndex, assignment.operationsAssignment);
      }
    }

    return capacityTracker;
  }

  removeFromCapacityTracker(capacityTracker, order, weekIndex, operationsAssignment) {
    for (const [operationId, lineName] of Object.entries(operationsAssignment)) {
      if (capacityTracker[lineName] && capacityTracker[lineName][weekIndex] !== undefined) {
        capacityTracker[lineName][weekIndex] += order.orderQty; // Add back the capacity
      }
    }
  }
}

module.exports = GeneticAlgorithmOptimizer;