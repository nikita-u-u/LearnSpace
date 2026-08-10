import mongoose from 'mongoose';

const lessonSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  duration: {
    type: String, // e.g. "12:34"
    required: true,
  },
  videoId: {
    type: String,
    required: true,
  },
  provider: {
    type: String,
    enum: ['youtube', 'vimeo'],
    default: 'youtube',
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed'],
    default: 'pending',
  },
  checkedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

export const Lesson = mongoose.models.Lesson || mongoose.model('Lesson', lessonSchema);
