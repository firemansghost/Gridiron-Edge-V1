/**
 * CSV Export Utility
 * 
 * Converts an array of objects to CSV format and triggers a browser download.
 */

/**
 * Escape a CSV field value (handles commas, quotes, and newlines)
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If the value contains comma, quote, or newline, wrap it in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

/**
 * Convert an array of objects to CSV string
 */
function arrayToCsv(rows: Record<string, any>[], headers?: string[]): string {
  if (rows.length === 0) {
    return '';
  }

  // Use provided headers or extract from first object
  const csvHeaders = headers || Object.keys(rows[0]);
  
  // Build CSV rows
  const csvRows = [
    // Header row
    csvHeaders.map(escapeCsvField).join(','),
    // Data rows
    ...rows.map(row => 
      csvHeaders.map(header => escapeCsvField(row[header])).join(',')
    ),
  ];

  return csvRows.join('\n');
}

/**
 * Download data as CSV file
 * 
 * @param filename - Name of the file (e.g., "picks-week-10.csv")
 * @param rows - Array of objects to export
 * @param headers - Optional array of header names (uses object keys if not provided)
 */
export function downloadAsCsv(
  filename: string,
  rows: Record<string, any>[],
  headers?: string[]
): void {
  if (rows.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Generate CSV content
  const csvContent = arrayToCsv(rows, headers);

  // Create BOM for Excel UTF-8 support
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  
  // Trigger download
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

