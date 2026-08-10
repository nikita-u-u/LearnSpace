import 'dotenv/config';
import bcrypt from 'bcryptjs';

const accounts = [
  { email: 'priya@learnspace.dev', role: 'student' },
  { email: 'rio@learnspace.dev', role: 'admin' }
];

console.log('Seed plan ready:');
for (const account of accounts) {
  console.log(`- ${account.email} (${account.role}), password: letmein123, hash: ${bcrypt.hashSync('letmein123', 10)}`);
}
console.log('Replace this file with Mongoose Course/User models when MongoDB is connected.');
