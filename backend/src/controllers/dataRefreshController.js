import asyncHandler from 'express-async-handler';
import { dataSources } from '../config/dataSources.js';
import { DatasetRecord } from '../models/DatasetRecord.js';
import { ImportRun } from '../models/ImportRun.js';
import { Work } from '../models/Work.js';

export const getDataRefreshOverview = asyncHandler(async (req, res) => {
  const [sourceStats, recentRuns, workCount] = await Promise.all([
    DatasetRecord.aggregate([{ $group: { _id: '$source', rowCount: { $sum: 1 }, lastSync: { $max: '$updatedAt' } } }]),
    ImportRun.aggregate([{ $sort: { createdAt: -1 } }, { $group: { _id: '$source', run: { $first: '$$ROOT' } } }]),
    Work.countDocuments(),
  ]);
  const statBySource = new Map(sourceStats.map((item) => [item._id, item]));
  const runBySource = new Map(recentRuns.map((item) => [item._id, item.run]));
  const sources = dataSources.map((source) => {
    const stat = statBySource.get(source.key); const run = runBySource.get(source.key);
    const status = run?.status || (stat?.rowCount ? 'healthy' : 'missing');
    const rowCount = stat?.rowCount || run?.importedRows || 0;
    return { ...source, status, rowCount, lastSync: run?.createdAt || stat?.lastSync || null, failedRows: run?.failedRows || 0, message: run?.message || (rowCount ? 'Source available and indexed.' : 'Source has not been imported.') };
  });
  const healthySources = sources.filter((source) => source.status === 'healthy').length;
  const failedRows = sources.reduce((sum, source) => sum + source.failedRows, 0);
  res.json({ health: { status: healthySources === sources.length && !failedRows ? 'healthy' : 'warning', healthySources, totalSources: sources.length, failedRows, workCount, lastSync: sources.reduce((latest, source) => !latest || (source.lastSync && new Date(source.lastSync) > new Date(latest)) ? source.lastSync : latest, null) }, sources });
});
