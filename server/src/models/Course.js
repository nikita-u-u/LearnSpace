import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    default: 0,
  },
  level: {
    type: String,
    required: true,
  },
  teacher: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    default: 0,
  },
  studentsCount: {
    type: Number,
    default: 0,
  },
  lessons: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
  }],
}, {
  timestamps: true,
});

export const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);
