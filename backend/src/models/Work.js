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
    mpName: { type: String, default: '', trim: true },
    house: { type: String, default: '', trim: true },
    sanctionedAmount: { type: Number, required: true, min: 0 },
    expenditureAmount: { type: Number, required: true, min: 0 },
    expenditureSource: { type: String, enum: ['DIRECT_PAYMENT', 'MP_SUMMARY_ALLOCATION', 'UNAVAILABLE'], default: 'UNAVAILABLE' },
    progress: { type: Number, required: true, min: 0, max: 100 },
    progressSource: { type: String, enum: ['REPORTED', 'FINANCIAL_UTILIZATION', 'MOCK_ESTIMATE'], default: 'REPORTED' },
    status: { type: String, enum: ['Sanctioned', 'Ongoing', 'Completed', 'Delayed'], required: true, index: true },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true, index: true },
    riskScore: { type: Number, required: true, min: 0, max: 100 },
    alert: { type: String, default: '' },
    underReview: { type: Boolean, default: false },
    coordinates: { latitude: { type: Number, required: true }, longitude: { type: Number, required: true } },

    // Fraud Response & Risk Action Workflow
    riskStatus: {
      type: String,
      enum: ['ACTIVE', 'FLAGGED', 'ON_HOLD', 'UNDER_REVIEW', 'CLEARED', 'ESCALATED', 'AGENCY_SUSPENDED'],
      default: 'ACTIVE',
    },
    holdReason: { type: String, default: '' },
    holdAt: { type: Date },
    holdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    holdActorName: { type: String, default: '' },
    reviewAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewAssignedAt: { type: Date },
    reviewDueAt: { type: Date },
    reviewDecision: { type: String, enum: ['PENDING', 'CLEARED', 'ESCALATED', 'NONE'], default: 'NONE' },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewerName: { type: String, default: '' },
    reviewNotes: { type: String, default: '' },
    reviewEvidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    escalationStatus: { type: String, default: 'NONE' },
    escalatedAt: { type: Date },
    escalatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    escalationReason: { type: String, default: '' },
    appealStatus: {
      type: String,
      enum: ['NONE', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'],
      default: 'NONE',
    },
    appealReason: { type: String, default: '' },
    appealSubmittedBy: { type: String, default: '' },
    appealSubmittedAt: { type: Date },
    appealEvidence: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

workSchema.index({ riskScore: -1, updatedAt: -1 });

export const Work = mongoose.model('Work', workSchema);
