import mongoose from 'mongoose';

const workSchema = new mongoose.Schema(
  {
    workId: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true, index: true },
    district: { type: String, required: true, trim: true, index: true },
    agency: { type: String, required: true, trim: true },
    sector: { type: String, required: true, trim: true },
    constituency: { type: String, required: true, trim: true },
    sanctionedAmount: { type: Number, required: true, min: 0 },
    expenditureAmount: { type: Number, required: true, min: 0 },
    progress: { type: Number, required: true, min: 0, max: 100 },
    status: { type: String, enum: ['Sanctioned', 'Ongoing', 'Completed', 'Delayed'], required: true, index: true },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true, index: true },
    riskScore: { type: Number, required: true, min: 0, max: 100 },
    alert: { type: String, default: '' },
    underReview: { type: Boolean, default: false },
    coordinates: { latitude: { type: Number, required: true }, longitude: { type: Number, required: true } },
  },
  { timestamps: true }
);

workSchema.index({ title: 'text', workId: 'text', district: 'text', agency: 'text' });

export const Work = mongoose.model('Work', workSchema);
