import mongoose from 'mongoose';

const importRunSchema = new mongoose.Schema({
  source: { type: String, required: true, index: true },
  importedRows: { type: Number, required: true, min: 0 },
  failedRows: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['healthy', 'warning', 'failed'], default: 'healthy' },
  message: { type: String, default: '' },
}, { timestamps: true });

export const ImportRun = mongoose.model('ImportRun', importRunSchema);
