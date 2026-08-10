import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 4000);
const secret = process.env.JWT_ACCESS_SECRET || 'local-dev-only-change-me';
const users = new Map([
  ['priya@learnspace.dev', { email: 'priya@learnspace.dev', name: 'Priya Raman', role: 'student', passwordHash: bcrypt.hashSync('letmein123', 10) }],
  ['rio@learnspace.dev', { email: 'rio@learnspace.dev', name: 'Rio Fernandes', role: 'admin', passwordHash: bcrypt.hashSync('letmein123', 10) }]
]);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'learnspace-api' }));
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = users.get(email);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub: user.email, role: user.role }, secret, { expiresIn: '15m' });
  res.json({ token, user: { email: user.email, name: user.name, role: user.role } });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../client/dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.listen(port, '0.0.0.0', () => console.log(`LearnSpace API running on port ${port}`));
