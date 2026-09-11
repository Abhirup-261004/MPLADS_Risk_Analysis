import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Provide a valid email address'],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['admin', 'analyst', 'viewer', 'district_authority', 'ministry'], default: 'analyst' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    preferences: {
      defaultFinancialYear: { type: String, default: 'FY 2024-2025', trim: true, maxlength: 20 },
      defaultState: { type: String, default: '', trim: true, maxlength: 80 },
      defaultNotificationView: { type: String, enum: ['all', 'unread', 'critical', 'warnings', 'system'], default: 'all' },
      itemsPerPage: { type: Number, default: 25, min: 10, max: 100 },
    },
    notificationPreferences: {
      riskAlerts: { type: Boolean, default: true },
      anomalyAlerts: { type: Boolean, default: true },
      delayAlerts: { type: Boolean, default: true },
      costAnomalies: { type: Boolean, default: true },
      paymentMismatch: { type: Boolean, default: true },
      duplicateWorkAlerts: { type: Boolean, default: true },
      complianceAlerts: { type: Boolean, default: true },
      systemNotifications: { type: Boolean, default: true },
      reportNotifications: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    isActive: this.isActive,
    lastLoginAt: this.lastLoginAt,
    preferences: this.preferences,
    notificationPreferences: this.notificationPreferences,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
