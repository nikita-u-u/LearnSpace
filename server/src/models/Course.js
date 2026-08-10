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
  /**
   * Price in whole rupees, used for display, filtering and sorting.
   * 0 means the course is free.
   */
  price: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  /**
   * Authoritative charge amount in the smallest currency unit (paise).
   * Stripe only accepts integers, and deriving this from a float `price`
   * at request time risks drift (e.g. 1999.9999 -> 199999). Storing it
   * explicitly keeps the amount exact and auditable.
   */
  priceInPaise: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  currency: {
    type: String,
    required: true,
    default: 'inr',
    lowercase: true,
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
