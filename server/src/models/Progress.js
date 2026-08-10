import mongoose from 'mongoose';

/**
 * One row per user per lesson. Course-level percentages are derived from these
 * rather than stored, so a course gaining or losing lessons cannot leave a
 * stale total behind.
 */
const progressSchema = new mongoose.Schema({
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
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  /** Furthest playback position, so "resume where you left off" is possible. */
  secondsWatched: {
    type: Number,
    default: 0,
    min: 0,
  },
  completedAt: {
    type: Date,
  },
  lastViewedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

progressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

export const Progress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);
