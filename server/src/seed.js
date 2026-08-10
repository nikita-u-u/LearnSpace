import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from './lib/db.js';
import { User } from './models/User.js';

const accounts = [
  { email: 'priya@learnspace.dev', name: 'Priya Raman', role: 'student', password: 'letmein123' },
  { email: 'rio@learnspace.dev', name: 'Rio Fernandes', role: 'admin', password: 'letmein123' }
];

async function seed() {
  console.log('🌱 Starting database seed...');
  
  try {
    await connectDB();
    
    for (const account of accounts) {
      const existing = await User.findOne({ email: account.email });
      if (!existing) {
        const passwordHash = await bcrypt.hash(account.password, 12);
        await User.create({
          email: account.email,
          name: account.name,
          role: account.role,
          passwordHash
        });
        console.log(`✅ Created user: ${account.email} (${account.role})`);
      } else {
        console.log(`⚠️ User already exists: ${account.email} (${account.role})`);
      }
    }

    console.log('🎉 Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    mongoose.disconnect();
  }
}

seed();
