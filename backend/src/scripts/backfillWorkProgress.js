import { connectDatabase } from '../config/database.js';
import { Work } from '../models/Work.js';

await connectDatabase();

function mockProgress(workId) {
  return 8 + [...String(workId)].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 0) % 63;
}

const result = await Work.updateMany(
  {
    status: { $ne: 'Completed' },
    sanctionedAmount: { $gt: 0 },
    expenditureAmount: { $gt: 0 },
  },
  [
    {
      $set: {
        progress: {
          $min: [
            95,
            {
              $max: [
                '$progress',
                { $round: [{ $multiply: [{ $divide: ['$expenditureAmount', '$sanctionedAmount'] }, 100] }, 0] },
              ],
            },
          ],
        },
        progressSource: 'FINANCIAL_UTILIZATION',
      },
    },
    {
      $set: {
        status: { $cond: [{ $gt: ['$progress', 0] }, 'Ongoing', '$status'] },
      },
    },
  ]
);

const missingProgress = await Work.find({ status: { $ne: 'Completed' }, progress: 0 }, '_id workId').lean();
let operations = missingProgress.map((work) => ({
  updateOne: {
    filter: { _id: work._id },
    update: { $set: { progress: mockProgress(work.workId), progressSource: 'MOCK_ESTIMATE', status: 'Ongoing' } },
  },
}));
while (operations.length) await Work.bulkWrite(operations.splice(0, 1000), { ordered: false });

console.log(`Updated progress for ${result.modifiedCount} works using financial utilization and ${missingProgress.length} with mock estimates.`);
process.exit(0);
