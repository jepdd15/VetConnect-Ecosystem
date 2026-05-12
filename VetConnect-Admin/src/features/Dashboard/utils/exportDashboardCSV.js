/**
 * exportDashboardCSV — Generates and downloads a CSV of the dashboard's 
 * primary forensic data for a given period.
 */

export function exportDashboardCSV(data, period, clinicSettings) {
  const { financial, growth, clinical } = data;
  
  let csvContent = 'data:text/csv;charset=utf-8,';
  
  // 1. Header Information
  csvContent += `Clinic,${clinicSettings.clinicName || 'Starbarks Veterinary Clinic'}\r\n`;
  csvContent += `Period,${period.toUpperCase()}\r\n`;
  csvContent += `Exported At,${new Date().toLocaleString('en-PH')}\r\n\r\n`;

  // 2. Financial KPIs
  csvContent += 'FINANCIAL METRICS\r\n';
  csvContent += `Total Revenue Collected,${financial?.totalCollected || 0}\r\n`;
  csvContent += `Total Billed,${financial?.totalBilled || 0}\r\n`;
  csvContent += `Total Expenses,${financial?.totalExpenses || 0}\r\n`;
  csvContent += `Net Margin,${financial?.netMargin || 0}\r\n`;
  csvContent += `Revenue Leakage (Unbilled),${financial?.leakageEstimatedAmount || 0}\r\n`;
  csvContent += `Unbilled Appointment Count,${financial?.leakageCount || 0}\r\n\r\n`;

  // 3. Operational KPIs
  csvContent += 'OPERATIONAL METRICS\r\n';
  csvContent += `Total Appointments,${growth?.totalAppointments || 0}\r\n`;
  csvContent += `Walk-ins,${growth?.walkInCount || 0}\r\n`;
  csvContent += `Scheduled,${growth?.scheduledCount || 0}\r\n`;
  csvContent += `New Clients,${growth?.newClientCount || 0}\r\n`;
  csvContent += `Vaccine Compliance,${clinical?.complianceRate || 0}%\r\n\r\n`;

  // 4. Detailed Service Popularity
  if (growth?.serviceRanking?.length > 0) {
    csvContent += 'TOP SERVICES\r\n';
    csvContent += 'Service Name,Count\r\n';
    growth.serviceRanking.forEach(s => {
      csvContent += `"${s.name}",${s.count}\r\n`;
    });
    csvContent += '\r\n';
  }

  // 5. Detailed Diagnosis Ranking
  if (clinical?.topDiagnoses?.length > 0) {
    csvContent += 'TOP DIAGNOSES\r\n';
    csvContent += 'Diagnosis,Count\r\n';
    clinical.topDiagnoses.forEach(d => {
      csvContent += `"${d.diagnosis}",${d.count}\r\n`;
    });
    csvContent += '\r\n';
  }

  // 6. Expense Breakdown
  if (financial?.expenseCategories) {
    csvContent += 'EXPENSES BY CATEGORY\r\n';
    csvContent += 'Category,Amount\r\n';
    Object.entries(financial.expenseCategories).forEach(([cat, amt]) => {
      csvContent += `"${cat}",${amt}\r\n`;
    });
    csvContent += '\r\n';
  }

  // Download Trigger
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `VetConnect_Dashboard_${period}_${new Date().getTime()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
