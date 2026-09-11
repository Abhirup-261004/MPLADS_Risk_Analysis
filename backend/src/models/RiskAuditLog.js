import mongoose from 'mongoose';

export const AUDIT_EVENT_TYPES = [
  'RISK_FLAGGED',
  'HOLD_APPLIED',
  'REVIEW_ASSIGNED',
  'REVIEW_STARTED',
  'WORK_CLEARED',
  'WORK_ESCALATED',
  'AGENCY_SUSPENSION_REQUESTED',
  'AGENCY_SUSPENDED',
  'APPEAL_SUBMITTED',
  'APPEAL_DECISION',
  'HOLD_RELEASED',
];

const riskAuditLogSchema = new mongoose.Schema(
  {
    workId: { type: String, required: true, trim: true, index: true },
    eventType: {
      type: String,
      enum: AUDIT_EVENT_TYPES,
      required: true,
      index: true,
    },
    previousState: { type: String, default: 'ACTIVE' },
    newState: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, default: 'System' },
    actorRole: { type: String, default: 'system' },
    reason: { type: String, default: '', trim: true },
    evidenceSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

riskAuditLogSchema.index({ workId: 1, timestamp: -1 });
riskAuditLogSchema.index({ eventType: 1, timestamp: -1 });

// Ensure immutability on standard update query hooks
riskAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate'], function () {
  throw new Error('RiskAuditLog is append-only and immutable.');
});

export const RiskAuditLog = mongoose.model('RiskAuditLog', riskAuditLogSchema);

