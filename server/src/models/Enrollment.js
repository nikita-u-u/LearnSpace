import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true,
  },
  /**
   * `pending`  a PaymentIntent exists but has not succeeded yet. No access.
   * `active`   payment confirmed (or the course was free). Access granted.
   * `refunded` access revoked after a refund.
   *
   * Only `active` unlocks lessons. This is checked server-side on every
   * protected request, never trusted from the browser.
   */
  status: {
    type: String,
    enum: ['pending', 'active', 'refunded'],
    default: 'pending',
    index: true,
  },
  stripePaymentIntentId: {
    type: String,
    index: true,
  },
  /** What was actually charged, recorded for support and reconciliation. */
  amountPaid: {
    type: Number,
    default: 0,
  },
  currency: {
    type: String,
    default: 'inr',
  },
  paidAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// One enrollment row per user per course. Also makes the upsert in the
// payment flow safe against duplicate webhook deliveries.
enrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);
