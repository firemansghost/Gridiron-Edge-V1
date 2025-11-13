/**
 * Data Inventory Audit
 * 
 * Emits comprehensive inventory of all relevant tables:
 * - Row counts, weeks covered, null% by column, 5-row samples
 * - Updates DATA_COLLECTION_STATUS.md
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

interface ColumnStats {
  name: string;
  nullCount: number;
  nullPercent: number;
  nonNullCount: number;
  sampleValues: (string | number | null)[];
}

interface TableInventory {
  tableName: string;
  rowCount: number;
  weeks: number[];
  season: number[];
  columns: ColumnStats[];
  sampleRows: any[];
}

async function getTableInventory(tableName: string, season?: number): Promise<TableInventory | null> {
  console.log(`\n📊 Inventorying ${tableName}...`);
  
  try {
    let whereClause: any = {};
    if (season) {
      whereClause.season = season;
    }
    
    // Get row count
    const rowCount = await (prisma as any)[tableName].count({ where: whereClause });
    
    if (rowCount === 0) {
      console.log(`   ⚠️  No rows found`);
      return null;
    }
    
    // Get weeks and seasons
    const weekData = await (prisma as any)[tableName].findMany({
      where: whereClause,
      select: { week: true, season: true },
      distinct: ['week', 'season'],
    });
    
    const weeks = Array.from(new Set(weekData.map((d: any) => d.week))).sort((a, b) => a - b);
    const seasons = Array.from(new Set(weekData.map((d: any) => d.season))).sort((a, b) => a - b);
    
    // Get sample rows
    const sampleRows = await (prisma as any)[tableName].findMany({
      where: whereClause,
      take: 5,
      orderBy: { id: 'asc' },
    });
    
    // Get column stats (this is approximate - we'll sample)
    const allRows = await (prisma as any)[tableName].findMany({
      where: whereClause,
      take: 1000, // Sample for performance
    });
    
    if (allRows.length === 0) {
      return {
        tableName,
        rowCount,
        weeks,
        season: seasons,
        columns: [],
        sampleRows: [],
      };
    }
    
    // Analyze columns from sample
    const columnNames = Object.keys(allRows[0]);
    const columns: ColumnStats[] = [];
    
    for (const colName of columnNames) {
      if (colName === 'id' || colName.startsWith('_')) continue;
      
      const values = allRows.map((r: any) => r[colName]);
      const nullCount = values.filter((v: any) => v === null || v === undefined).length;
      const nullPercent = (nullCount / values.length) * 100;
      const nonNullCount = values.length - nullCount;
      
      // Get sample non-null values
      const nonNullValues = values.filter((v: any) => v !== null && v !== undefined);
      const sampleValues = nonNullValues.slice(0, 5).map((v: any) => {
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'object') return JSON.stringify(v).substring(0, 50);
        return String(v).substring(0, 50);
      });
      
      columns.push({
        name: colName,
        nullCount,
        nullPercent,
        nonNullCount,
        sampleValues,
      });
    }
    
    return {
      tableName,
      rowCount,
      weeks,
      season: seasons,
      columns,
      sampleRows: sampleRows.map((r: any) => {
        const clean: any = {};
        for (const [key, value] of Object.entries(r)) {
          if (value instanceof Date) {
            clean[key] = value.toISOString();
          } else if (typeof value === 'object' && value !== null) {
            clean[key] = JSON.stringify(value).substring(0, 100);
          } else {
            clean[key] = value;
          }
        }
        return clean;
      }),
    };
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  console.log('='.repeat(70));
  console.log(`📋 DATA INVENTORY AUDIT (Season ${season})`);
  console.log('='.repeat(70));
  
  const tables = [
    'game',
    'team',
    'gameTrainingRow',
    'teamGameAdj',
    'teamSeasonRating',
    'cfbdTeamGameEff',
    'cfbdTeamSeasonEff',
    'cfbdTeamTalent',
    'cfbdReturningProduction',
    'oddsLine',
  ];
  
  const inventories: TableInventory[] = [];
  
  for (const tableName of tables) {
    const inventory = await getTableInventory(tableName, season);
    if (inventory) {
      inventories.push(inventory);
    }
  }
  
  // Generate CSV
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const csvRows = ['table_name,column_name,null_count,null_percent,non_null_count'];
  for (const inv of inventories) {
    for (const col of inv.columns) {
      csvRows.push(`${inv.tableName},${col.name},${col.nullCount},${col.nullPercent.toFixed(2)},${col.nonNullCount}`);
    }
  }
  
  fs.writeFileSync(
    path.join(reportsDir, 'data_inventory.csv'),
    csvRows.join('\n')
  );
  console.log(`\n✅ Generated reports/data_inventory.csv`);
  
  // Generate summary markdown
  const summaryLines = [
    `# Data Inventory Summary (Season ${season})`,
    `\nGenerated: ${new Date().toISOString()}\n`,
    '## Overview\n',
  ];
  
  for (const inv of inventories) {
    summaryLines.push(`### ${inv.tableName}`);
    summaryLines.push(`- **Row Count**: ${inv.rowCount.toLocaleString()}`);
    summaryLines.push(`- **Seasons**: ${inv.season.join(', ')}`);
    summaryLines.push(`- **Weeks**: ${inv.weeks.length > 0 ? `${inv.weeks[0]} - ${inv.weeks[inv.weeks.length - 1]}` : 'N/A'}`);
    summaryLines.push(`- **Columns**: ${inv.columns.length}`);
    summaryLines.push('\n#### Column Null Rates\n');
    summaryLines.push('| Column | Null % | Null Count | Non-Null Count |');
    summaryLines.push('|--------|--------|------------|----------------|');
    
    for (const col of inv.columns.slice(0, 20)) { // Limit to first 20 columns
      summaryLines.push(`| ${col.name} | ${col.nullPercent.toFixed(2)}% | ${col.nullCount} | ${col.nonNullCount} |`);
    }
    
    if (inv.columns.length > 20) {
      summaryLines.push(`\n*... and ${inv.columns.length - 20} more columns*`);
    }
    
    summaryLines.push('\n#### Sample Rows\n');
    summaryLines.push('```json');
    summaryLines.push(JSON.stringify(inv.sampleRows, null, 2));
    summaryLines.push('```\n');
  }
  
  fs.writeFileSync(
    path.join(reportsDir, 'data_inventory_summary.md'),
    summaryLines.join('\n')
  );
  console.log(`✅ Generated reports/data_inventory_summary.md`);
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Inventory complete');
  console.log('='.repeat(70) + '\n');
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

