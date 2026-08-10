import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'refunded'],
    default: 'active',
  },
  stripePaymentId: {
    type: String,
  },
}, {
  timestamps: true,
});

// Ensure a user can only have one active/refunded enrollment per course 
// to prevent duplicates, though maybe we just want one enrollment per course per user.
enrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);
