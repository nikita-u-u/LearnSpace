import mongoose from 'mongoose';

/**
 * Avatar styles. Each user is assigned one at signup, then rendered as inline
 * SVG on the client. Deliberately not Gravatar: that would leak a hash of the
 * user's email to a third party on every page load.
 */
export const AVATAR_STYLES = ['orbit', 'wave', 'grid', 'burst', 'arc', 'stack'];

/** Palette used for the generated avatars. */
export const AVATAR_PALETTE = [
  'indigo', 'teal', 'amber', 'rose', 'violet', 'lime', 'cyan', 'coral',
];

export function randomAvatar() {
  return {
    avatarStyle: AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)],
    avatarColor: AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)],
  };
}

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    // Immutable by design: the email is the account identity and is used for
    // deletion confirmation, so it cannot be changed through the profile API.
    immutable: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student',
  },
  avatarStyle: {
    type: String,
    enum: AVATAR_STYLES,
    default: () => randomAvatar().avatarStyle,
  },
  avatarColor: {
    type: String,
    enum: AVATAR_PALETTE,
    default: () => randomAvatar().avatarColor,
  },
}, {
  timestamps: true,
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
