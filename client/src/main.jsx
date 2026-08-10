import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import LearnSpace from './LearnSpace';

// ── Demo catalog generation (same 500-course algorithm as before) ────────────
const pools = {
  Development: ['JavaScript','TypeScript','React','Node.js','Python','Go','Rust','Java','Flutter','GraphQL'],
  Data: ['SQL','Pandas','Statistics','Machine Learning','PyTorch','Data Engineering','A/B Testing','NLP'],
  Design: ['Figma','Typography','UX Research','Design Systems','Motion Design','Accessibility'],
  Business: ['Product Management','Strategy','Finance','Leadership','Negotiation','Operations'],
  Marketing: ['SEO','Copywriting','Email Marketing','Growth','Brand Positioning'],
  Cloud: ['AWS','Docker','Kubernetes','Terraform','Linux','CI/CD'],
  Security: ['Web Security','Cryptography','Ethical Hacking','Cloud Security'],
  Language: ['Spanish','French','German','Japanese','Mandarin'],
  Creative: ['Photography','Video Editing','Music Production','Writing','Animation'],
  Growth: ['Productivity','Deep Work','Career Change','Personal Finance','Interviewing'],
};
const videoIds = ['PkZNo7MFNFg','W6NZfCO5SIk','hdI2bqOjy3c','kUMe1FH4CHE','rfscVS0vtbw','_uQrJ0TkZlc','8DvywoWv6fI','HXV3zeQKqGY','7S_tz1z_5bA','RBSGKlAvoiM','V_xro1bcAuA','aircAruvnKk','Ilg3gGewQ5U','IHZwWFHWa-w','fNk_zzaMoSs','RGOj5yH7evk','0IAPZzGSbME','bMknfKXIFA8','SqcY0GlETPk','Ke90Tje7VS0'];
const teachers = ['Ana Petrova','Dmitri Sokolov','Marisol Duarte','Ife Adeyemi','Keiko Tan','Rio Fernandes','Lucía Moreno','Aisha Rahman','Wei Zhang','Elena Vasquez','Kwame Mensah','Mei Chen'];
const angles = ['from Scratch','The Complete Guide','Practical Workshop','Deep Dive','Patterns and Pitfalls','for Busy People','Build Real Projects','Fundamentals'];
const lessonTitles = ['The mental model','Core skills','A practical workflow','Common mistakes','Testing the result','Project walkthrough','Going further','Shipping your work','Final challenge'];

let seed = 81;
const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

const cats = Object.keys(pools);
const COURSES = Array.from({ length: 500 }, (_, i) => {
  const cat = cats[i % cats.length];
  const subject = pools[cat][Math.floor(i / cats.length) % pools[cat].length];
  const title = subject + ' ' + angles[Math.floor(i / 30) % angles.length];
  const price = i % 3 === 0 ? 0 : [19, 29, 39, 49, 59, 79][i % 6];
  const lessons = Array.from({ length: 5 + i % 6 }, (_, j) => ({
    id: `c${i}-l${j}`,
    title: lessonTitles[j],
    duration: `${6 + (i + j) % 10}:${String((i * 13 + j * 7) % 60).padStart(2, '0')}`,
    videoId: videoIds[(i * 3 + j) % videoIds.length],
  }));
  return {
    id: `c${i}`,
    title,
    category: cat,
    teacher: teachers[i % teachers.length],
    price,
    level: ['Beginner', 'Intermediate', 'Advanced'][i % 3],
    rating: (4 + (i % 10) / 10).toFixed(1),
    students: 350 + (i * 977) % 49000,
    lessons,
    description: `A focused ${subject} course built around practical work. Learn the concepts, avoid common traps, and finish with something you can show.`,
    createdAt: new Date(Date.now() - i * 86400000 * 3).toISOString(),
  };
});

const DEMO_USERS = {
  student: { email: 'priya@learnspace.dev', password: 'letmein123', name: 'Priya Raman', role: 'Student', enrollments: ['c3', 'c19', 'c42'] },
  admin: { email: 'rio@learnspace.dev', password: 'letmein123', name: 'Rio Fernandes', role: 'Admin', enrollments: ['c3', 'c19', 'c42'] },
};

// ── App shell ────────────────────────────────────────────────────────────────
function App() {
  const [user, setUser] = useState(null);
  const [enrollments, setEnrollments] = useState(new Set(['c3', 'c19', 'c42']));
  const [loading] = useState(false);
  const [error] = useState('');

  const userWithEnrollments = useMemo(
    () => user ? { ...user, enrollments: [...enrollments] } : null,
    [user, enrollments],
  );

  function handleLogin() {
    // Demo: auto-login as student. In production, open your auth flow here.
    setUser(DEMO_USERS.student);
    setEnrollments(new Set(DEMO_USERS.student.enrollments));
  }

  function handleLogout() {
    setUser(null);
  }

  async function handleEnroll(courseId) {
    // Demo: instant enrollment. In production, call your backend + Stripe here.
    setEnrollments(prev => new Set([...prev, courseId]));
  }

  async function handlePlayLesson({ courseId, lessonId }) {
    // Find the lesson's videoId and verify it via YouTube oEmbed before returning
    const course = COURSES.find(c => c.id === courseId);
    const lesson = course?.lessons.find(l => l.id === lessonId);
    if (!lesson) throw new Error('Lesson not found');

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + lesson.videoId)}&format=json`;
    const res = await fetch(oembedUrl, { mode: 'cors' });
    if (!res.ok) throw new Error('Video could not be verified');

    return `https://www.youtube-nocookie.com/embed/${lesson.videoId}?autoplay=1&rel=0`;
  }

  return (
    <LearnSpace
      courses={COURSES}
      user={userWithEnrollments}
      loading={loading}
      error={error}
      onLogin={handleLogin}
      onLogout={handleLogout}
      onEnroll={handleEnroll}
      onPlayLesson={handlePlayLesson}
      onRetry={() => {}}
    />
  );
}

createRoot(document.getElementById('root')).render(<App />);
