// src/utils/ExcelHandler.js
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const Logger = require(path.resolve(__dirname, 'Logger'));

class ExcelHandler {
  constructor() {
    this.logger = Logger.getInstance();
  }
  async streamExcelToResponse(res, data) {
    const workbook = new ExcelJS.Workbook();

    for (const [sheetName, sheetData] of Object.entries(data)) {
      const worksheet = workbook.addWorksheet(sheetName);

      if (Array.isArray(sheetData) && sheetData.length > 0) {
        const headers = Object.keys(sheetData[0]);
        worksheet.columns = headers.map(header => ({
          header: this.formatHeader(header),
          key: header,
          width: this.getColumnWidth(header)
        }));

        worksheet.addRows(sheetData);

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '366092' }
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.eachRow(row => {
          row.eachCell(cell => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        });

        this.formatWorksheetColumns(worksheet, sheetName);
      }
    }

    res.setHeader('Content-Disposition', 'attachment; filename="sample_data.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    await workbook.xlsx.write(res);
    console.log("Excel written");
    res.end(); 
  }

  async streamResultsToResponse(res, analysisResults, solution, fitnessHistory) {
    const data = {
      Summary: this.createSummaryData(analysisResults),
      Order_Results: analysisResults.orderResults,
      Priority_Analysis: this.createPriorityAnalysisData(analysisResults),
      Capacity_Utilization: this.createCapacityUtilizationData(analysisResults),
      Weekly_Schedule: this.createWeeklyScheduleData(solution, analysisResults),
      Fitness_Evolution: fitnessHistory.map((fitness, index) => ({
        Generation: index + 1,
        Fitness_Score: fitness
      })),
      Component_Analysis: this.createComponentAnalysisData(analysisResults)
    };
  
    await this.streamExcelToResponse(res, data, true);
  }
  async readExcelFile(filePath) {
    try {
      this.logger.info(`Reading Excel file: ${filePath}`);
      const workbook = XLSX.readFile(filePath);
      const data = {};

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        data[sheetName] = XLSX.utils.sheet_to_json(worksheet, { defval: null });
      }

      this.logger.info(`Successfully read Excel file with ${Object.keys(data).length} sheets`);
      return data;
    } catch (error) {
      this.logger.error(`Error reading Excel file: ${error.message}`);
      throw error;
    }
  }

  async writeExcelFile(filePath, data, formatting = true) {
    try {
      this.logger.info(`Writing Excel file: ${filePath}`);

      if (formatting) {
        await this.writeFormattedExcel(filePath, data);
      } else {
        await this.writeSimpleExcel(filePath, data);
      }

      this.logger.info(`Successfully wrote Excel file: ${filePath}`);
    } catch (error) {
      this.logger.error(`Error writing Excel file: ${error.message}`);
      throw error;
    }
  }

  async writeSimpleExcel(filePath, data) {
    const workbook = XLSX.utils.book_new();

    for (const [sheetName, sheetData] of Object.entries(data)) {
      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    XLSX.writeFile(workbook, filePath);
  }

  async writeFormattedExcel(filePath, data) {
    const workbook = new ExcelJS.Workbook();

    for (const [sheetName, sheetData] of Object.entries(data)) {
      const worksheet = workbook.addWorksheet(sheetName);

      if (Array.isArray(sheetData) && sheetData.length > 0) {
        // Add headers
        const headers = Object.keys(sheetData[0]);
        worksheet.columns = headers.map(header => ({
          header: this.formatHeader(header),
          key: header,
          width: this.getColumnWidth(header)
        }));

        // Add data
        worksheet.addRows(sheetData);

        // Format headers
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '366092' }
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // Add borders
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        });

        // Format specific columns
        this.formatWorksheetColumns(worksheet, sheetName);
      }
    }

    await workbook.xlsx.writeFile(filePath);
  }

  formatHeader(header) {
    return header.replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/_/g, ' ');
  }

  getColumnWidth(header) {
    const widths = {
      orderNumber: 15,
      productId: 12,
      customerPriority: 15,
      originalPromiseDate: 18,
      optimizedScheduledDate: 20,
      delayDays: 12,
      revenue: 15,
      default: 12
    };

    return widths[header] || widths.default;
  }

  formatWorksheetColumns(worksheet, sheetName) {
    if (sheetName === 'Order_Results') {
      // Format currency columns
      const revenueColumn = worksheet.getColumn('revenue');
      revenueColumn.numFmt = '$#,##0.00';

      // Format date columns
      const promiseDateColumn = worksheet.getColumn('originalPromiseDate');
      promiseDateColumn.numFmt = 'yyyy-mm-dd';

      const scheduledDateColumn = worksheet.getColumn('optimizedScheduledDate');
      scheduledDateColumn.numFmt = 'yyyy-mm-dd';
    }

    if (sheetName === 'Summary') {
      // Format summary values
      worksheet.getColumn('Value').alignment = { horizontal: 'right' };
    }
  }

  async createSampleDataFile(planningSystem, filePath) {
    const data = {
      Products: this.convertMapToArray(planningSystem.products),
      Line_Restrictions: this.convertLineRestrictionsToArray(planningSystem.lineRestrictions),
      Operations: this.convertOperationsToArray(planningSystem.operations),
      Sales_Orders: this.convertSalesOrdersToArray(planningSystem.salesOrders),
      Penalty_Rules: this.convertMapToArray(planningSystem.penaltyRules),
      Component_Availability: this.convertComponentAvailabilityToArray(planningSystem.componentAvailability),
      Weekly_Capacity: this.convertWeeklyCapacityToArray(planningSystem.lineRestrictions, planningSystem.weeks)
    };

    await this.writeExcelFile(filePath, data, true);
  }

  async createResultsFile(analysisResults, solution, fitnessHistory, filePath) {
    const data = {
      Summary: this.createSummaryData(analysisResults),
      Order_Results: analysisResults.orderResults,
      Priority_Analysis: this.createPriorityAnalysisData(analysisResults),
      Capacity_Utilization: this.createCapacityUtilizationData(analysisResults),
      Weekly_Schedule: this.createWeeklyScheduleData(solution, analysisResults),
      Fitness_Evolution: fitnessHistory.map((fitness, index) => ({
        Generation: index + 1,
        Fitness_Score: fitness
      })),
      Component_Analysis: this.createComponentAnalysisData(analysisResults)
    };

    await this.writeExcelFile(filePath, data, true);
  }

  convertMapToArray(map) {
    return Array.from(map.values());
  }

  convertLineRestrictionsToArray(lineRestrictions) {
    return Array.from(lineRestrictions.values()).map(lr => ({
      restrictionName: lr.restrictionName,
      validity: lr.validity,
      penaltyCost: lr.penaltyCost,
      avgWeeklyCapacity: this.calculateAverageCapacity(lr.weeklyCapacity)
    }));
  }

  convertOperationsToArray(operations) {
    return Array.from(operations.values()).map(op => ({
      operationId: op.operationId,
      primaryLineRestriction: op.primaryLineRestriction,
      alternateLineRestrictions: op.alternateLineRestrictions.join(', ')
    }));
  }

  convertSalesOrdersToArray(salesOrders) {
    return Array.from(salesOrders.values()).map(so => ({
      orderNumber: so.orderNumber,
      productId: so.productId,
      orderPromiseDate: moment(so.orderPromiseDate).format('YYYY-MM-DD'),
      orderQty: so.orderQty,
      revenue: so.revenue,
      cost: so.cost,
      customerPriority: so.customerPriority,
      operations: so.operations.join(', '),
      componentsRequired: this.formatComponents(so.components)
    }));
  }

  convertComponentAvailabilityToArray(componentAvailability) {
    const result = [];
    for (const [componentId, availability] of componentAvailability) {
      for (const [week, quantity] of Object.entries(availability.weeklyAvailability)) {
        result.push({
          componentId: componentId,
          week: week,
          availableQuantity: quantity
        });
      }
    }
    return result;
  }

  convertWeeklyCapacityToArray(lineRestrictions, weeks) {
    const result = [];
    for (const [restrictionName, restriction] of lineRestrictions) {
      for (const week of weeks.slice(0, 12)) { // First 12 weeks
        result.push({
          restrictionName: restrictionName,
          week: week,
          capacity: restriction.weeklyCapacity[week] || 0
        });
      }
    }
    return result;
  }

  calculateAverageCapacity(weeklyCapacity) {
    const values = Object.values(weeklyCapacity);
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  formatComponents(components) {
    return Object.entries(components)
      .filter(([_, qty]) => qty > 0)
      .map(([comp, qty]) => `${comp}:${qty}`)
      .join(', ');
  }

  createSummaryData(analysisResults) {
    return [
      { Metric: 'Planning Start Date', Value: analysisResults.planningStartDate },
      { Metric: 'Min Early Delivery Days', Value: analysisResults.minEarlyDeliveryDays },
      { Metric: 'Total Orders', Value: analysisResults.orderResults.length },
      { Metric: 'Valid Assignments', Value: analysisResults.totalValidOrders },
      { Metric: 'Invalid Assignments (Past)', Value: analysisResults.invalidAssignments },
      { Metric: 'Too Early Assignments', Value: analysisResults.ordersTooEarly },
      { Metric: 'Orders On Time', Value: analysisResults.ordersOnTime },
      { Metric: 'Orders Early (Within Window)', Value: analysisResults.ordersEarly },
      { Metric: 'Orders Late', Value: analysisResults.ordersLate },
      { Metric: 'On-Time Percentage (%)', Value: analysisResults.onTimePercentage.toFixed(1) },
      { Metric: 'Total Penalty Cost ($)', Value: analysisResults.totalPenalty.toFixed(2) }
    ];
  }

  createPriorityAnalysisData(analysisResults) {
    const validOrders = analysisResults.orderResults.filter(order => !order.isInvalid);
    const priorityGroups = {};

    for (const order of validOrders) {
      if (!priorityGroups[order.customerPriority]) {
        priorityGroups[order.customerPriority] = {
          customerPriority: order.customerPriority,
          totalOrders: 0,
          lateOrders: 0,
          totalRevenue: 0,
          delaySum: 0,
          delayCount: 0
        };
      }

      const group = priorityGroups[order.customerPriority];
      group.totalOrders++;
      group.totalRevenue += order.revenue;

      if (order.isLate) {
        group.lateOrders++;
        if (typeof order.delayDays === 'number') {
          group.delaySum += order.delayDays;
          group.delayCount++;
        }
      }
    }

    return Object.values(priorityGroups).map(group => ({
      customerPriority: group.customerPriority,
      totalOrders: group.totalOrders,
      lateOrders: group.lateOrders,
      onTimeRate: ((group.totalOrders - group.lateOrders) / group.totalOrders * 100).toFixed(1),
      avgDelayDays: group.delayCount > 0 ? (group.delaySum / group.delayCount).toFixed(1) : 0,
      totalRevenue: group.totalRevenue.toFixed(2)
    }));
  }

  createCapacityUtilizationData(analysisResults) {
    const result = [];

    for (const [line, weeklyUsage] of Object.entries(analysisResults.capacityUsage)) {
      const maxUsage = Math.max(...Object.values(weeklyUsage));
      const totalUsage = Object.values(weeklyUsage).reduce((sum, val) => sum + val, 0);

      result.push({
        lineRestriction: line,
        maxWeeklyUsage: maxUsage,
        totalUsage: totalUsage,
        peakUtilization: 0 // Would need system reference to calculate
      });
    }

    return result;
  }

  createWeeklyScheduleData(solution, analysisResults) {
    const result = [];

    for (const [orderNumber, assignment] of Object.entries(solution)) {
      const orderResult = analysisResults.orderResults.find(r => r.orderNumber === orderNumber);
      if (orderResult && !orderResult.isInvalid) {
        for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
          result.push({
            orderNumber: orderNumber,
            productId: orderResult.productId,
            scheduledDate: orderResult.optimizedScheduledDate,
            operationId: operationId,
            lineRestriction: lineRestriction,
            quantity: orderResult.orderQty,
            customerPriority: orderResult.customerPriority
          });
        }
      }
    }

    return result;
  }

  createComponentAnalysisData(analysisResults) {
    const result = [];

    for (const [component, weeklyUsage] of Object.entries(analysisResults.componentUsage)) {
      const maxUsage = Math.max(...Object.values(weeklyUsage));
      const totalUsage = Object.values(weeklyUsage).reduce((sum, val) => sum + val, 0);

      result.push({
        component: component,
        maxWeeklyUsage: maxUsage,
        totalUsage: totalUsage,
        peakUtilization: 0 // Would need system reference to calculate
      });
    }

    return result;
  }
}

module.exports = ExcelHandler;