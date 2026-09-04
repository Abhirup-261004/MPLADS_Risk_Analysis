import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  generatedBy: { type: String, required: true, trim: true },
  status: { type: String, enum: ['ready', 'processing'], default: 'ready' },
  configuration: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const Report = mongoose.model('Report', reportSchema);
