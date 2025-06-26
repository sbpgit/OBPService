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

  async createResultsFile(analysisResults, solution, fitnessHistory, filePath) {
    const data = {
      Summary: this.createSummaryData(analysisResults),
      Order_Results: analysisResults.orderResults || [],
      Priority_Analysis: this.createPriorityAnalysisData(analysisResults),
      Capacity_Utilization: this.createCapacityUtilizationData(analysisResults),
      Capacity_Pivot_Table: this.createCapacityPivotTableData(analysisResults, solution),
      Weekly_Schedule: this.createWeeklyScheduleData(solution, analysisResults),
      Fitness_Evolution: (fitnessHistory || []).map((fitness, index) => ({
        Generation: index + 1,
        Fitness_Score: fitness || 0
      })),
      Component_Analysis: this.createComponentAnalysisData(analysisResults)
    };

    await this.writeExcelFile(filePath, data, true);
    
    // Also create separate pivot table file
    try {
      const pivotFilePath = filePath.replace('.xlsx', '_Capacity_Pivot.xlsx');
      await this.createCapacityPivotTable(analysisResults, solution, pivotFilePath);
    } catch (error) {
      this.logger.warn('Could not create separate pivot table:', error.message);
    }
  }

  createCapacityPivotTableData(analysisResults, solution) {
    const pivotData = this.generateCapacityPivotData(analysisResults, solution);
    const result = [];
    
    for (const [lineRestriction, weekData] of Object.entries(pivotData)) {
      for (const [week, quantity] of Object.entries(weekData)) {
        result.push({
          Line_Restriction: lineRestriction,
          Week: week,
          Scheduled_Quantity: quantity || 0
        });
      }
    }
    
    return result;
  }

  generateCapacityPivotData(analysisResults, solution) {
    const pivotData = {};
    
    if (!analysisResults || !analysisResults.orderResults || !solution) {
      return pivotData;
    }
    
    // Get all valid order results
    const validOrders = analysisResults.orderResults.filter(order => {
      return order && 
             !order.isInvalid && 
             order.optimizedScheduledDate && 
             order.optimizedScheduledDate !== 'INVALID - PAST DATE' &&
             order.optimizedScheduledDate !== 'TOO EARLY - VIOLATES CONSTRAINT' &&
             typeof order.optimizedScheduledDate === 'string';
    });
    
    for (const orderResult of validOrders) {
      try {
        const orderNumber = orderResult.orderNumber;
        const assignment = solution[orderNumber];
        
        if (!assignment || !assignment.operationsAssignment) {
          continue;
        }
        
        const scheduledDate = orderResult.optimizedScheduledDate;
        
        // Handle different date formats
        let weekKey;
        try {
          const date = moment(scheduledDate);
          if (date.isValid()) {
            weekKey = `W${date.format('YYYY-WW')}`;
          } else {
            continue;
          }
        } catch (error) {
          continue;
        }
        
        // Process all operations for this order
        for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
          if (lineRestriction && typeof lineRestriction === 'string') {
            if (!pivotData[lineRestriction]) {
              pivotData[lineRestriction] = {};
            }
            
            if (!pivotData[lineRestriction][weekKey]) {
              pivotData[lineRestriction][weekKey] = 0;
            }
            
            const quantity = parseInt(orderResult.orderQty) || 0;
            pivotData[lineRestriction][weekKey] += quantity;
          }
        }
      } catch (error) {
        this.logger.warn(`Error processing order ${orderResult.orderNumber}:`, error.message);
      }
    }
    
    return pivotData;
  }

  async createCapacityPivotTable(analysisResults, solution, filePath) {
    const pivotData = this.generateCapacityPivotData(analysisResults, solution);
    
    if (Object.keys(pivotData).length === 0) {
      this.logger.warn('No pivot data available, creating empty pivot table');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Capacity_Pivot_Table');
      worksheet.addRow(['Line_Restriction', 'Week', 'Scheduled_Quantity']);
      await workbook.xlsx.writeFile(filePath);
      return;
    }
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Capacity_Pivot_Table');
    
    // Get unique weeks (columns)
    const allWeeks = new Set();
    Object.values(pivotData).forEach(lineData => {
      Object.keys(lineData).forEach(week => allWeeks.add(week));
    });
    
    const sortedWeeks = Array.from(allWeeks).sort();
    
    // Create headers
    const headers = ['Line_Restriction', ...sortedWeeks, 'Total'];
    worksheet.columns = headers.map(header => ({
      header: header,
      key: header,
      width: header === 'Line_Restriction' ? 20 : 12
    }));
    
    // Add data rows
    const totalsByWeek = {};
    
    for (const [lineRestriction, weekData] of Object.entries(pivotData)) {
      const row = { Line_Restriction: lineRestriction };
      let lineTotal = 0;
      
      for (const week of sortedWeeks) {
        const quantity = weekData[week] || 0;
        row[week] = quantity;
        lineTotal += quantity;
        
        if (!totalsByWeek[week]) totalsByWeek[week] = 0;
        totalsByWeek[week] += quantity;
      }
      
      row['Total'] = lineTotal;
      worksheet.addRow(row);
    }
    
    // Add totals row
    const totalsRow = { Line_Restriction: 'TOTAL' };
    let grandTotal = 0;
    
    for (const week of sortedWeeks) {
      totalsRow[week] = totalsByWeek[week] || 0;
      grandTotal += totalsByWeek[week] || 0;
    }
    totalsRow['Total'] = grandTotal;
    
    const totalRowIndex = worksheet.addRow(totalsRow).number;
    
    // Format the worksheet
    this.formatPivotTable(worksheet, headers.length, totalRowIndex);
    
    await workbook.xlsx.writeFile(filePath);
  }

  formatPivotTable(worksheet, columnCount, totalRowIndex) {
    // Header formatting
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '366092' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    
    // Total row formatting
    if (totalRowIndex) {
      const totalRow = worksheet.getRow(totalRowIndex);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'F2F2F2' }
      };
    }
    
    // Add borders to all cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        // Center align numbers
        if (cell.col > 1) {
          cell.alignment = { horizontal: 'center' };
        }
      });
    });
  }

  createSummaryData(analysisResults) {
    const results = analysisResults || {};
    const orderResults = results.orderResults || [];
    
    return [
      { Metric: 'Planning Start Date', Value: results.planningStartDate || 'Not Set' },
      { Metric: 'Min Early Delivery Days', Value: results.minEarlyDeliveryDays || 0 },
      { Metric: 'Total Orders', Value: orderResults.length },
      { Metric: 'Valid Assignments', Value: results.totalValidOrders || 0 },
      { Metric: 'Invalid Assignments (Past)', Value: results.invalidAssignments || 0 },
      { Metric: 'Too Early Assignments', Value: results.ordersTooEarly || 0 },
      { Metric: 'Orders On Time', Value: results.ordersOnTime || 0 },
      { Metric: 'Orders Early (Within Window)', Value: results.ordersEarly || 0 },
      { Metric: 'Orders Late', Value: results.ordersLate || 0 },
      { Metric: 'On-Time Percentage (%)', Value: (results.onTimePercentage || 0).toFixed(1) },
      { Metric: 'Total Penalty Cost ($)', Value: (results.totalPenalty || 0).toFixed(2) }
    ];
  }

  createPriorityAnalysisData(analysisResults) {
    const orderResults = analysisResults.orderResults || [];
    const validOrders = orderResults.filter(order => 
      order && !order.isInvalid && order.customerPriority && typeof order.delayDays === 'number'
    );
    
    if (validOrders.length === 0) {
      return [];
    }
    
    // Get all unique priorities dynamically
    const priorities = [...new Set(validOrders.map(order => order.customerPriority))];
    const priorityGroups = {};

    // Initialize all priorities
    priorities.forEach(priority => {
      priorityGroups[priority] = {
        customerPriority: priority,
        totalOrders: 0,
        lateOrders: 0,
        totalRevenue: 0,
        delaySum: 0,
        delayCount: 0
      };
    });

    // Process orders
    for (const order of validOrders) {
      const priority = order.customerPriority;
      const group = priorityGroups[priority];
      
      if (group) {
        group.totalOrders++;
        group.totalRevenue += parseFloat(order.revenue) || 0;

        if (order.isLate) {
          group.lateOrders++;
          if (typeof order.delayDays === 'number') {
            group.delaySum += order.delayDays;
            group.delayCount++;
          }
        }
      }
    }

    return Object.values(priorityGroups).map(group => ({
      customerPriority: group.customerPriority,
      totalOrders: group.totalOrders,
      lateOrders: group.lateOrders,
      onTimeRate: group.totalOrders > 0 ? ((group.totalOrders - group.lateOrders) / group.totalOrders * 100).toFixed(1) : "0.0",
      avgDelayDays: group.delayCount > 0 ? (group.delaySum / group.delayCount).toFixed(1) : "0.0",
      totalRevenue: group.totalRevenue.toFixed(2)
    }));
  }

  createCapacityUtilizationData(analysisResults) {
    const result = [];
    const capacityUsage = analysisResults.capacityUsage || {};
    
    for (const [line, weeklyUsage] of Object.entries(capacityUsage)) {
      if (weeklyUsage && typeof weeklyUsage === 'object') {
        const usageValues = Object.values(weeklyUsage).filter(val => typeof val === 'number' && val >= 0);
        
        if (usageValues.length > 0) {
          const maxUsage = Math.max(...usageValues);
          const totalUsage = usageValues.reduce((sum, val) => sum + val, 0);
          
          result.push({
            lineRestriction: line,
            maxWeeklyUsage: maxUsage,
            totalUsage: totalUsage,
            averageUsage: usageValues.length > 0 ? (totalUsage / usageValues.length).toFixed(1) : 0,
            peakUtilization: 0  // Will be calculated if system reference available
          });
        }
      }
    }
    
    return result;
  }

  createWeeklyScheduleData(solution, analysisResults) {
    const result = [];
    const orderResults = analysisResults.orderResults || [];
    
    for (const [orderNumber, assignment] of Object.entries(solution || {})) {
      const orderResult = orderResults.find(r => r.orderNumber === orderNumber);
      if (orderResult && !orderResult.isInvalid && assignment && assignment.operationsAssignment) {
        for (const [operationId, lineRestriction] of Object.entries(assignment.operationsAssignment)) {
          result.push({
            orderNumber: orderNumber,
            productId: orderResult.productId || 'Unknown',
            scheduledDate: orderResult.optimizedScheduledDate || 'Unknown',
            operationId: operationId,
            lineRestriction: lineRestriction,
            quantity: orderResult.orderQty || 0,
            customerPriority: orderResult.customerPriority || 'Unknown'
          });
        }
      }
    }
    
    return result;
  }

  createComponentAnalysisData(analysisResults) {
    const result = [];
    const componentUsage = analysisResults.componentUsage || {};
    
    for (const [component, weeklyUsage] of Object.entries(componentUsage)) {
      if (weeklyUsage && typeof weeklyUsage === 'object') {
        const usageValues = Object.values(weeklyUsage).filter(val => typeof val === 'number' && val >= 0);
        
        if (usageValues.length > 0) {
          const maxUsage = Math.max(...usageValues);
          const totalUsage = usageValues.reduce((sum, val) => sum + val, 0);
          
          result.push({
            component: component,
            maxWeeklyUsage: maxUsage,
            totalUsage: totalUsage,
            peakUtilization: 0
          });
        }
      }
    }
    
    return result;
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
      try {
        const revenueColumn = worksheet.getColumn('revenue');
        if (revenueColumn) {
          revenueColumn.numFmt = '$#,##0.00';
        }
      } catch (error) {
        // Column might not exist
      }
    }
  }

  async writeSimpleExcel(filePath, data) {
    const workbook = XLSX.utils.book_new();

    for (const [sheetName, sheetData] of Object.entries(data)) {
      const worksheet = XLSX.utils.json_to_sheet(sheetData || []);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    XLSX.writeFile(workbook, filePath);
  }
}

module.exports = ExcelHandler;