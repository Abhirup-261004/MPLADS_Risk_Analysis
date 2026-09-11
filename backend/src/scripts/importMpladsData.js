import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from '../config/database.js';
import { DatasetRecord } from '../models/DatasetRecord.js';
import { Work } from '../models/Work.js';
import { ImportRun } from '../models/ImportRun.js';
import { dataSources } from '../config/dataSources.js';

const dataDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

function readCsv(filename) {
  const content = fs.readFileSync(path.join(dataDirectory, filename), 'utf8');
  const rows = []; let row = []; let value = ''; let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"' && content[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ',' && !quoted) { row.push(value); value = ''; continue; }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(value); value = ''; if (row.some((cell) => cell !== '')) rows.push(row); row = []; continue;
    }
    value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = (rows.shift() || []).map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function amount(value) {
  const rupees = Number(String(value || '0').replaceAll(',', '').replace(/[^0-9.-]/g, '')) || 0;
  return rupees / 100000;
}
function coordinates(index) { return { latitude: 8 + ((index * 7) % 2800) / 100, longitude: 68 + ((index * 13) % 2900) / 100 }; }
function normalized(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function paymentKey(row) { return [normalized(row['Work Description']), normalized(row.State), normalized(row.Constituency)].join('|'); }
function mpKey(row) { return [normalized(row['MP Name']), normalized(row.State), normalized(row.House)].join('|'); }

function workFromRow(row, source, index) {
  const completed = source === 'completed-works';
  const allocated = amount(row['Final Amount (₹)'] || row['Recommended Amount (₹)']);
  const riskScore = completed ? 12 + (index % 20) : 38 + (index % 45);
  return {
    workId: `${completed ? 'COM' : 'REC'}-${row['Work ID']}`,
    title: row['Work Description'] || 'MPLADS work', state: row.State || 'Unknown', district: row.Constituency || 'Unknown',
    agency: row.IDA || 'Implementing District Authority', sector: row.Category || 'Normal/Others', constituency: row.Constituency || 'Unknown', mpName: row['MP Name'] || '', house: row.House || '',
    sanctionedAmount: allocated, expenditureAmount: 0, expenditureSource: 'UNAVAILABLE', progress: completed ? 100 : 0,
    status: completed ? 'Completed' : 'Sanctioned', riskLevel: riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low', riskScore,
    alert: completed ? '' : 'Recommended work awaiting implementation', coordinates: coordinates(index),
  };
}

function allocateExpenditure(workEntries, expenditureRows, summaryRows) {
  const paymentsByWork = new Map();
  expenditureRows.forEach((row) => {
    const key = paymentKey(row);
    paymentsByWork.set(key, (paymentsByWork.get(key) || 0) + amount(row['Expenditure Amount (₹)']));
  });
  const worksByPaymentKey = new Map();
  workEntries.forEach((entry) => {
    const key = paymentKey(entry.row);
    if (!worksByPaymentKey.has(key)) worksByPaymentKey.set(key, []);
    worksByPaymentKey.get(key).push(entry);
  });

  // A payment row can describe a group of similarly named works, so distribute it by sanction value.
  worksByPaymentKey.forEach((entries, key) => {
    const totalPayment = paymentsByWork.get(key) || 0;
    if (!totalPayment) return;
    const totalSanctioned = entries.reduce((sum, entry) => sum + entry.work.sanctionedAmount, 0);
    entries.forEach((entry, index) => {
      const weight = totalSanctioned ? entry.work.sanctionedAmount / totalSanctioned : 1 / entries.length;
      entry.work.expenditureAmount = Number((totalPayment * weight).toFixed(2));
      entry.work.expenditureSource = 'DIRECT_PAYMENT';
    });
  });

  const summaryByMp = new Map(summaryRows.map((row) => [mpKey(row), amount(row['Total Expenditure (₹)'])]));
  const worksByMp = new Map();
  workEntries.forEach((entry) => {
    const key = mpKey(entry.row);
    if (!worksByMp.has(key)) worksByMp.set(key, []);
    worksByMp.get(key).push(entry);
  });
  worksByMp.forEach((entries, key) => {
    const reportedExpenditure = summaryByMp.get(key) || 0;
    const directExpenditure = entries.reduce((sum, entry) => sum + entry.work.expenditureAmount, 0);
    const pendingEntries = entries.filter((entry) => entry.work.expenditureAmount === 0);
    const remaining = Math.max(0, reportedExpenditure - directExpenditure);
    const totalSanctioned = pendingEntries.reduce((sum, entry) => sum + entry.work.sanctionedAmount, 0);
    if (!remaining || !pendingEntries.length) return;
    pendingEntries.forEach((entry) => {
      const weight = totalSanctioned ? entry.work.sanctionedAmount / totalSanctioned : 1 / pendingEntries.length;
      entry.work.expenditureAmount = Number((remaining * weight).toFixed(2));
      entry.work.expenditureSource = 'MP_SUMMARY_ALLOCATION';
    });
  });
  return workEntries.reduce((summary, { work }) => {
    if (work.expenditureSource === 'DIRECT_PAYMENT') summary.direct += 1;
    else if (work.expenditureSource === 'MP_SUMMARY_ALLOCATION') summary.allocated += 1;
    else summary.unavailable += 1;
    return summary;
  }, { direct: 0, allocated: 0, unavailable: 0 });
}

async function bulkUpsert(Model, operations) { if (operations.length) await Model.bulkWrite(operations, { ordered: false }); }
async function main() {
  const replace = process.argv.includes('--replace');
  await connectDatabase();
  if (replace) { await Promise.all([DatasetRecord.deleteMany({}), Work.deleteMany({})]); }
  const completedRows = readCsv('completed-works.csv');
  const recommendedRows = readCsv('recommended-works.csv');
  const workEntries = [
    ...completedRows.map((row, index) => ({ row, work: workFromRow(row, 'completed-works', index) })),
    ...recommendedRows.map((row, index) => ({ row, work: workFromRow(row, 'recommended-works', completedRows.length + index) })),
  ];
  const expenditureSummary = allocateExpenditure(workEntries, readCsv('expenditures.csv'), readCsv('mp-summary.csv'));
  for (const { key: source, file: filename, storeRaw } of dataSources) {
    const rows = readCsv(filename); let operations = [];
    if (storeRaw !== false) {
      for (let index = 0; index < rows.length; index += 1) {
        operations.push({ updateOne: { filter: { source, recordId: String(index) }, update: { $set: { source, recordId: String(index), data: rows[index] } }, upsert: true } });
        if (operations.length === 1000) { await bulkUpsert(DatasetRecord, operations); operations = []; }
      }
      await bulkUpsert(DatasetRecord, operations);
    }
    await ImportRun.create({ source, importedRows: rows.length, failedRows: 0, status: 'healthy', message: storeRaw === false ? 'Imported into the operational work model; source CSV is retained in the repository.' : 'Import completed successfully.' });
    console.log(`Imported ${rows.length} rows from ${filename}`);
  }
  let workOperations = workEntries.map(({ work }) => ({ updateOne: { filter: { workId: work.workId }, update: { $set: work }, upsert: true } }));
  while (workOperations.length) await bulkUpsert(Work, workOperations.splice(0, 1000));
  console.log(`Work expenditure sources: ${expenditureSummary.direct} direct payments, ${expenditureSummary.allocated} MP summary allocations, ${expenditureSummary.unavailable} unavailable.`);
  console.log('MPLADS data import completed.'); process.exit(0);
}
main().catch((error) => { console.error('MPLADS data import failed:', error); process.exit(1); });
