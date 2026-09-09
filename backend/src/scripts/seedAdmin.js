import { User } from '../models/User.js';
import { Work } from '../models/Work.js';

const workSeed = [
  { workId: 'MPL-WB-25-01284', title: 'Construction of Community Hall', state: 'West Bengal', district: 'Howrah', agency: 'Zilla Parishad', sector: 'Community Development', constituency: 'Howrah', sanctionedAmount: 25, expenditureAmount: 31.4, progress: 72, status: 'Ongoing', riskLevel: 'high', riskScore: 89, alert: 'Cost Overrun Detected', coordinates: { latitude: 22.5958, longitude: 88.2636 } },
  { workId: 'MPL-MH-24-08832', title: 'Solar Street Lights Installation', state: 'Maharashtra', district: 'Pune', agency: 'Gram Panchayat', sector: 'Energy', constituency: 'Pune', sanctionedAmount: 12.5, expenditureAmount: 8.2, progress: 45, status: 'Delayed', riskLevel: 'medium', riskScore: 54, alert: 'Delayed by 4 months', coordinates: { latitude: 18.5204, longitude: 73.8567 } },
  { workId: 'MPL-KA-23-04112', title: 'Procurement of Ambulances', state: 'Karnataka', district: 'Mysuru', agency: 'Dept of Health', sector: 'Health', constituency: 'Mysuru', sanctionedAmount: 45, expenditureAmount: 44.8, progress: 100, status: 'Completed', riskLevel: 'low', riskScore: 12, coordinates: { latitude: 12.2958, longitude: 76.6394 } },
  { workId: 'MPL-UP-25-09941', title: 'Deepening of Village Pond', state: 'Uttar Pradesh', district: 'Varanasi', agency: 'Irrigation Dept', sector: 'Water', constituency: 'Varanasi', sanctionedAmount: 15, expenditureAmount: 0, progress: 0, status: 'Sanctioned', riskLevel: 'high', riskScore: 94, alert: 'Potential Duplicate Sanction', coordinates: { latitude: 25.3176, longitude: 82.9739 } },
  { workId: 'MPL-TN-24-11205', title: 'Construction of Additional Classroom', state: 'Tamil Nadu', district: 'Madurai', agency: 'PWD', sector: 'Education', constituency: 'Madurai', sanctionedAmount: 35, expenditureAmount: 28, progress: 80, status: 'Ongoing', riskLevel: 'low', riskScore: 18, coordinates: { latitude: 9.9252, longitude: 78.1198 } },
];

export const seedAdmin = async () => {
  if (process.env.SEED_ADMIN_ON_START !== 'true') return;
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return console.warn('Admin seed skipped: email or password is missing.');

  const existing = await User.findOne({ email });
  if (!existing) {
    await User.create({ name: process.env.SEED_ADMIN_NAME || 'Administrator', email, password, role: 'admin' });
    console.log(`Development admin created: ${email}`);
  }
  await Work.bulkWrite(workSeed.map((work) => ({ updateOne: { filter: { workId: work.workId }, update: { $setOnInsert: work }, upsert: true } })));
};
