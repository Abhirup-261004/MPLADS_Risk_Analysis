import mongoose from 'mongoose';

/**
 * WorkRecommendation schema for MP users.
 * Represents a work recommendation submitted by an MP.
 */
const workRecommendationSchema = new mongoose.Schema(
  {
    recommendationId: { type: String, required: true, unique: true },
    mpId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    constituency: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    sector: { type: String, required: true, trim: true, maxlength: 80 },
    location: { type: String, trim: true, maxlength: 120 },
    district: { type: String, trim: true, maxlength: 80 },
    estimatedCost: { type: Number, min: 0 },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    expectedDuration: { type: String, trim: true, maxlength: 80 },
    beneficiaryDescription: { type: String, trim: true, maxlength: 500 },
    supportingDocuments: [{ name: String, url: String }],
    latitude: { type: Number },
    longitude: { type: Number },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'CLARIFICATION_REQUIRED',
        'RECOMMENDED',
        'SANCTIONED',
        'REJECTED',
        'BLOCKED',
      ],
      default: 'DRAFT',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const WorkRecommendation = mongoose.model('WorkRecommendation', workRecommendationSchema);

