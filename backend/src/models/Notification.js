import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'RISK_ALERT',
  'ANOMALY',
  'DELAY',
  'COST_ANOMALY',
  'PAYMENT_MISMATCH',
  'DUPLICATE_WORK',
  'COMPLIANCE',
  'AGENCY_RISK',
  'SYSTEM',
  'DATA_SYNC',
  'REPORT_READY',
];

export const NOTIFICATION_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    severity: { type: String, enum: NOTIFICATION_SEVERITIES, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, required: true, trim: true, maxlength: 800 },
    read: { type: Boolean, default: false },
    relatedEntityType: { type: String, trim: true, maxlength: 40 },
    relatedEntityId: { type: String, trim: true, maxlength: 80 },
    workId: { type: String, trim: true, index: true },
    riskId: { type: String, trim: true },
    state: { type: String, trim: true, index: true },
    district: { type: String, trim: true, index: true },
    status: { type: String, trim: true, index: true },
    riskScore: { type: Number, min: 0, max: 100 },
    detectionSource: { type: String, trim: true, maxlength: 120 },
    evidence: { type: String, trim: true, maxlength: 1000 },
    recommendedAction: { type: String, trim: true, maxlength: 500 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
