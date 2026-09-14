import mongoose from 'mongoose';

const tenderSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  state: { type: String, required: true, trim: true },
  district: { type: String, required: true, trim: true },
  sector: { type: String, required: true, trim: true },
  estimatedAmount: { type: Number, required: true, min: 0 },
  deadline: { type: Date, required: true },
  status: { type: String, enum: ['OPEN', 'CLOSED', 'AWARDED'], default: 'OPEN', index: true },
  eligibility: { states: [{ type: String }], sectors: [{ type: String }], minimumQualification: { type: String, default: '' } },
  documents: [{ name: String, url: String }],
}, { timestamps: true });

export const Tender = mongoose.model('Tender', tenderSchema);
