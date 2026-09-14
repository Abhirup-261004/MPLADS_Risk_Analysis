import mongoose from 'mongoose';

/**
 * FundingRequest schema for MP users.
 * Represents a request for funding that will be reviewed by government authorities.
 */
const fundingRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true },
    mpId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    constituency: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    financialYear: { type: String, required: true, trim: true, maxlength: 20 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    requestedAmount: { type: Number, required: true, min: 0 },
    purpose: { type: String, required: true, trim: true, maxlength: 500 },
    sector: { type: String, required: true, trim: true, maxlength: 80 },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    justification: { type: String, trim: true, maxlength: 1000 },
    supportingDocuments: [{ name: String, url: String }],
    status: {
      type: String,
      enum: [
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'CLARIFICATION_REQUIRED',
        'APPROVED',
        'REJECTED',
        'BLOCKED',
        'WITHDRAWN',
      ],
      default: 'DRAFT',
    },
    reviewHistory: [
      {
        reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        action: String,
        comment: String,
        at: { type: Date, default: Date.now },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const FundingRequest = mongoose.model('FundingRequest', fundingRequestSchema);

