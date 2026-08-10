// MUST be first, before any module that reads process.env. See lib/env.js.
import './lib/env.js';

import mongoose from 'mongoose';
import { connectDB } from './lib/db.js';
import { User, randomAvatar } from './models/User.js';
import { Course } from './models/Course.js';

/**
 * Backfills fields added after the initial seed, so existing documents do not
 * have to be wiped. Safe to run repeatedly.
 */
async function migrate() {
  console.log('🔧 Running migrations...');
  await connectDB();

  // 1. Assign an avatar to accounts created before avatars existed.
  const usersMissingAvatar = await User.find({
    $or: [{ avatarStyle: { $exists: false } }, { avatarColor: { $exists: false } }],
  }).select('_id');

  for (const user of usersMissingAvatar) {
    await User.updateOne({ _id: user._id }, { $set: randomAvatar() });
  }
  console.log(`   avatars assigned: ${usersMissingAvatar.length}`);

  // 2. Derive priceInPaise / currency for courses seeded before those existed.
  const coursesMissingPaise = await Course.find({
    $or: [{ priceInPaise: { $exists: false } }, { currency: { $exists: false } }],
  }).select('_id price');

  for (const course of coursesMissingPaise) {
    await Course.updateOne(
      { _id: course._id },
      { $set: { priceInPaise: Math.round((course.price || 0) * 100), currency: 'inr' } },
    );
  }
  console.log(`   course prices normalised: ${coursesMissingPaise.length}`);

  const summary = await Course.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        paid: { $sum: { $cond: [{ $gt: ['$price', 0] }, 1, 0] } },
      },
    },
  ]);

  if (summary.length) {
    const { total, paid } = summary[0];
    console.log(`   catalogue: ${paid}/${total} paid (${Math.round((paid / total) * 100)}%)`);
  }

  console.log('✅ Migrations complete');
  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error('❌ Migration failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
