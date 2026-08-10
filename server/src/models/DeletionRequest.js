import crypto from 'node:crypto';
import mongoose from 'mongoose';

/**
 * Account deletion is a two-step flow: request, then confirm via a link
 * emailed to the account address. That way a hijacked session alone cannot
 * destroy an account, and the person must still control the inbox.
 *
 * Only a SHA-256 hash of the token is stored. A leaked database dump therefore
 * does not let anyone confirm a pending deletion.
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
  tokenHash: {
    type: String,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  usedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Mongo removes the document automatically once it expires.
deletionRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createDeletionToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

export const DeletionRequest =
  mongoose.models.DeletionRequest || mongoose.model('DeletionRequest', deletionRequestSchema);
