// MUST be first, before any module that reads process.env. See lib/env.js.
import './lib/env.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from './lib/db.js';
import { User, randomAvatar } from './models/User.js';
import { Course } from './models/Course.js';
import { Lesson } from './models/Lesson.js';
import { Enrollment } from './models/Enrollment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const accounts = [
  { email: 'priya@learnspace.dev', name: 'Priya Raman', role: 'student', password: 'letmein123' },
  { email: 'rio@learnspace.dev', name: 'Rio Fernandes', role: 'admin', password: 'letmein123' }
];

const categories = ['Development', 'Data', 'Design', 'Business', 'Marketing', 'Cloud', 'Security', 'Language', 'Creative', 'Growth'];
const levels = ['Beginner', 'Intermediate', 'Advanced'];
const teachers = ['Ana Petrova','Dmitri Sokolov','Marisol Duarte','Ife Adeyemi','Keiko Tan','Rio Fernandes','Lucía Moreno','Aisha Rahman','Wei Zhang'];

/** Indian price points, in whole rupees, scaled by course level. */
const PRICE_TIERS = {
  Beginner: [499, 699, 899],
  Intermediate: [1299, 1499, 1799],
  Advanced: [1999, 2499, 2999],
};

/**
 * 60% of the catalogue is paid, 40% free.
 *
 * Uses a deterministic pattern rather than Math.random() so reseeding produces
 * an identical catalogue. `index % 5` cycles 0..4, and treating 2, 3 and 4 as
 * paid yields exactly 3 in every 5 courses.
 */
function isPaid(index) {
  return index % 5 >= 2;
}

function priceForCourse(index, level) {
  if (!isPaid(index)) return 0;
  const tier = PRICE_TIERS[level] ?? PRICE_TIERS.Beginner;
  return tier[index % tier.length];
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1);
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function seed() {
  console.log('🌱 Starting database seed...');
  
  try {
    await connectDB();
    
    // Seed Users
    for (const account of accounts) {
      const existing = await User.findOne({ email: account.email });
      if (!existing) {
        const passwordHash = await bcrypt.hash(account.password, 12);
        await User.create({
          email: account.email,
          name: account.name,
          role: account.role,
          passwordHash,
          ...randomAvatar(),
        });
        console.log(`✅ Created user: ${account.email} (${account.role})`);
      }
    }

    // Clear old courses and lessons. Enrollments reference course ids that are
    // about to be regenerated, so they would dangle if kept.
    await Course.deleteMany({});
    await Lesson.deleteMany({});
    const removedEnrollments = await Enrollment.deleteMany({});
    console.log(`🗑️ Cleared courses, lessons and ${removedEnrollments.deletedCount} stale enrollments`);

    // Parse CSV
    const csvPath = path.resolve(__dirname, '../../free_course_catalog_100.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true
    });

    console.log(`📊 Found ${records.length} courses in CSV`);

    let i = 0;
    let paidCount = 0;
    for (const record of records) {
      const videoId = extractVideoId(record.video_link);
      if (!videoId) continue;

      const level = levels[i % levels.length];
      const price = priceForCourse(i, level);
      if (price > 0) paidCount += 1;

      const course = await Course.create({
        title: record.course_name,
        description: record.ai_generated_description,
        category: categories[i % categories.length],
        price,
        // Integer paise is what Stripe is charged. 499 rupees -> 49900 paise.
        priceInPaise: price * 100,
        currency: 'inr',
        level,
        teacher: teachers[i % teachers.length],
        rating: (4 + (i % 10) / 10).toFixed(1),
        studentsCount: 350 + (i * 977) % 49000,
      });

      const lesson = await Lesson.create({
        courseId: course._id,
        title: 'Full Course',
        duration: '1:00:00', // Mock duration since CSV doesn't have it
        videoId: videoId,
        provider: 'youtube',
        verificationStatus: 'verified'
      });

      course.lessons.push(lesson._id);
      await course.save();
      i++;
    }

    const pct = i ? Math.round((paidCount / i) * 100) : 0;
    console.log(`🎉 Seeded ${i} courses with lessons`);
    console.log(`   💰 ${paidCount} paid (${pct}%), ${i - paidCount} free, priced in INR`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    mongoose.disconnect();
  }
}

seed();
