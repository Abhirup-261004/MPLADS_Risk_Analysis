import mongoose from 'mongoose';

const datasetRecordSchema = new mongoose.Schema({
  source: { type: String, required: true, index: true },
  recordId: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

datasetRecordSchema.index({ source: 1, recordId: 1 }, { unique: true });

export const DatasetRecord = mongoose.model('DatasetRecord', datasetRecordSchema);
