import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  agencyUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agencyName: { type: String, required: true, trim: true, index: true },
  workId: { type: String, trim: true, index: true },
  type: { type: String, enum: ['BID', 'PROGRESS_UPDATE', 'GEO_EVIDENCE', 'INVOICE', 'COMPLETION_CERTIFICATE', 'CLARIFICATION', 'REMEDIATION_PLAN'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  details: { type: String, required: true, trim: true, maxlength: 5000 },
  proposedAmount: { type: Number, min: 0 },
  proposedDurationDays: { type: Number, min: 1 },
  progress: { type: Number, min: 0, max: 100 },
  invoiceAmount: { type: Number, min: 0 },
  coordinates: { latitude: Number, longitude: Number },
  attachments: [{ name: String, url: String }],
  status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REQUESTED_CHANGES', 'ACCEPTED', 'REJECTED'], default: 'SUBMITTED', index: true },
  revision: { type: Number, default: 1, min: 1 },
}, { timestamps: true });

submissionSchema.index({ agencyUserId: 1, createdAt: -1 });
export const AgencySubmission = mongoose.model('AgencySubmission', submissionSchema);
