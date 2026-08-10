import mongoose from 'mongoose';

/**
 * A record that a user asked for their account to be deleted.
 *
 * Deletion is handled manually by the site owner: the request is emailed to
 * ADMIN_EMAIL and actioned by hand. This collection exists so requests are not
 * lost if email delivery fails, and so repeat clicks can be rate limited
 * instead of sending the owner one email per click.
 */
const deletionRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
  },
  name: {
    type: String,
  },
  /** Free-text reason, if the user chose to give one. */
  reason: {
    type: String,
    maxlength: 500,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  /** Whether the notification email actually reached the owner. */
  notified: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

export const DeletionRequest =
  mongoose.models.DeletionRequest || mongoose.model('DeletionRequest', deletionRequestSchema);
