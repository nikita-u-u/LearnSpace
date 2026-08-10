// MUST be first. Populates process.env before any other module is evaluated.
// See lib/env.js for why this cannot be a dotenv.config() call in this file.
import './lib/env.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// DB & Models
import { connectDB } from './lib/db.js';
import { User, randomAvatar } from './models/User.js';
import { Course } from './models/Course.js';
import { Lesson } from './models/Lesson.js';
import { Enrollment } from './models/Enrollment.js';
import { Progress } from './models/Progress.js';
import { DeletionRequest } from './models/DeletionRequest.js';
import {
  sendMail,
  deletionRequestEmail,
  isMailConfigured,
  adminEmail,
} from './lib/mailer.js';

// Payments & auth
import {
  getStripe,
  isStripeConfigured,
  isWebhookConfigured,
  getWebhookSecret,
  getCurrency,
  stripeUnavailableResponse,
  logStripeStatus,
} from './lib/stripe.js';
import { requireAuth } from './middleware/auth.js';

/** Escape user input so it cannot alter regex behaviour in a $regex query. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const app = express();
const port = Number(process.env.PORT || 4000);

/** Kept in sync with middleware/auth.js, which reads the same variable. */
function accessSecret() {
  return process.env.JWT_ACCESS_SECRET || 'local-dev-only-change-me';
}

// Render terminates TLS in front of the app.
app.set('trust proxy', 1);

/**
 * Allowed browser origins.
 *
 * On Vercel + Render the frontend and API are different origins, so CORS must
 * be explicit. CLIENT_ORIGIN accepts a comma-separated list, and Vercel
 * preview deployments are matched by pattern since their subdomain changes on
 * every push.
 */
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const vercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

app.use(cors({
  origin(origin, callback) {
    // Same-origin and server-to-server calls (curl, Stripe webhooks) send no
    // Origin header and must not be blocked.
    if (!origin) return callback(null, true);

    const normalised = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalised) || vercelPreview.test(normalised)) {
      return callback(null, true);
    }

    console.warn(`Blocked CORS request from origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

// ─────────────────────────────────────────────────────────────────────────────
// Stripe webhook
//
// Registered BEFORE express.json(). Signature verification hashes the exact
// bytes Stripe sent, so the body must stay unparsed. A JSON parser would
// re-serialise it and every signature check would fail.
// ─────────────────────────────────────────────────────────────────────────────
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).send('Stripe not configured');

    const signature = req.headers['stripe-signature'];
    let event;

    try {
      if (!isWebhookConfigured()) {
        // Refuse to trust an unsigned payload. Without the signing secret
        // anyone who can reach this URL could grant themselves a course.
        console.error('Webhook received but STRIPE_WEBHOOK_SECRET is not set. Rejecting.');
        return res.status(503).send('Webhook secret not configured');
      }
      event = stripe.webhooks.constructEvent(req.body, signature, getWebhookSecret());
    } catch (error) {
      console.error('Webhook signature verification failed:', error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
      await connectDB();

      switch (event.type) {
        case 'payment_intent.succeeded': {
          const intent = event.data.object;
          await activateEnrollmentFromIntent(intent);
          break;
        }

        case 'payment_intent.payment_failed': {
          const intent = event.data.object;
          console.warn(
            `Payment failed for intent ${intent.id}: ${intent.last_payment_error?.message || 'unknown reason'}`,
          );
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object;
          if (charge.payment_intent) {
            await Enrollment.findOneAndUpdate(
              { stripePaymentIntentId: charge.payment_intent },
              { status: 'refunded' },
            );
            console.log(`Enrollment refunded for intent ${charge.payment_intent}`);
          }
          break;
        }

        default:
          // Unhandled events are acknowledged so Stripe stops retrying them.
          break;
      }

      res.json({ received: true });
    } catch (error) {
      // A 500 tells Stripe to retry, which is what we want if the DB blipped.
      console.error('Webhook handler error:', error);
      res.status(500).send('Webhook handler failed');
    }
  },
);

app.use(express.json());

// Ensure MongoDB is connected before handling requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

/**
 * Flips an enrollment to `active`. Written as an idempotent upsert because
 * Stripe delivers webhooks at least once, so this can legitimately run twice
 * for the same payment.
 */
async function activateEnrollmentFromIntent(intent) {
  const { userId, courseId } = intent.metadata || {};

  if (!userId || !courseId) {
    console.error(`Intent ${intent.id} is missing userId/courseId metadata; cannot grant access.`);
    return;
  }

  const result = await Enrollment.findOneAndUpdate(
    { userId, courseId },
    {
      userId,
      courseId,
      status: 'active',
      stripePaymentIntentId: intent.id,
      amountPaid: intent.amount_received ?? intent.amount,
      currency: intent.currency,
      paidAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log(`✅ Enrollment active: user ${userId} -> course ${courseId} (intent ${intent.id})`);
  return result;
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarStyle: user.avatarStyle,
    avatarColor: user.avatarColor,
  };
}

/**
 * Completed-lesson counts per course for one user, as a Map keyed by course id.
 * Aggregated in a single query rather than per course.
 */
async function progressByCourse(userId) {
  const rows = await Progress.aggregate([
    { $match: { userId, completed: true } },
    { $group: { _id: '$courseId', completedLessons: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.completedLessons]));
}

function withProgress(course, completedLessons) {
  const totalLessons = (course.lessons || []).length;
  const done = Math.min(completedLessons || 0, totalLessons);
  return {
    totalLessons,
    completedLessons: done,
    percentComplete: totalLessons ? Math.round((done / totalLessons) * 100) : 0,
  };
}

function signToken(user) {
  // 7 days: a 15-minute access token with no refresh flow signed users out
  // mid-checkout. Shorten this once refresh-token rotation is implemented.
  return jwt.sign({ sub: user._id, role: user.role }, accessSecret(), { expiresIn: '7d' });
}

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    service: 'learnspace-api',
    stripe: isStripeConfigured() ? 'configured' : 'not_configured',
    webhook: isWebhookConfigured() ? 'configured' : 'not_configured',
    currency: getCurrency(),
  }),
);

// ─── Authentication ──────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Runbook: "Bcrypt cost 12 or Argon2id for new passwords"
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role: 'student', // default
      // Every account gets a randomly assigned generated avatar.
      ...randomAvatar(),
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/** Lets the client restore a session after a page refresh. */
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const enrollments = await Enrollment.find({
    userId: req.auth.userId,
    status: 'active',
  }).select('courseId');

  res.json({
    user: publicUser(req.user),
    enrollments: enrollments.map((e) => e.courseId.toString()),
  });
});

// ─── Courses ─────────────────────────────────────────────────────────────────

app.get('/api/courses', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit) || 24));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.category && req.query.category !== 'All') filter.category = req.query.category;
    if (req.query.level && req.query.level !== 'all') filter.level = req.query.level;
    if (req.query.price === 'free') filter.price = 0;
    if (req.query.price === 'paid') filter.price = { $gt: 0 };
    const search = String(req.query.search || '').trim();
    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { description: { $regex: safe, $options: 'i' } },
        { teacher: { $regex: safe, $options: 'i' } },
        { category: { $regex: safe, $options: 'i' } }
      ];
    }

    let sort = {};
    if (req.query.sort === 'low') sort.price = 1;
    else if (req.query.sort === 'high') sort.price = -1;
    else if (req.query.sort === 'new') sort.createdAt = -1;
    else sort.studentsCount = -1; // recommended

    const [courses, totalCount] = await Promise.all([
      Course.find(filter).sort(sort).skip(skip).limit(limit).populate('lessons').lean(),
      Course.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // Transform `_id` to `id` for frontend compatibility. `videoId` is
    // deliberately stripped: the browser gets it only from the gated
    // playback endpoint, after enrollment has been verified.
    const formattedCourses = courses.map(c => ({
      ...c,
      id: c._id.toString(),
      lessons: (c.lessons || []).map(({ videoId, ...l }) => ({
        ...l,
        id: l._id.toString(),
      }))
    }));

    res.json({
      courses: formattedCourses,
      totalCount,
      totalPages,
      currentPage: page
    });
  } catch (error) {
    console.error('Fetch courses error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * The signed-in user's unlocked courses.
 *
 * "My learning" cannot be built by filtering the current catalogue page, since
 * an enrolled course may sit on any page of the paginated results.
 */
app.get('/api/courses/mine', requireAuth, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({
      userId: req.auth.userId,
      status: 'active',
    }).select('courseId paidAt amountPaid currency').lean();

    if (!enrollments.length) return res.json({ courses: [] });

    const byCourseId = new Map(
      enrollments.map((e) => [e.courseId.toString(), e]),
    );

    const [courses, completedMap, completedLessonRows] = await Promise.all([
      Course.find({ _id: { $in: [...byCourseId.keys()] } }).populate('lessons').lean(),
      progressByCourse(req.auth.userId),
      Progress.find({ userId: req.auth.userId, completed: true }).select('lessonId').lean(),
    ]);

    const completedLessonIds = new Set(
      completedLessonRows.map((r) => r.lessonId.toString()),
    );

    const payload = courses.map((c) => {
      const courseId = c._id.toString();
      const enrollment = byCourseId.get(courseId);
      const progress = withProgress(c, completedMap.get(courseId));

      return {
        ...c,
        id: courseId,
        lessons: (c.lessons || []).map(({ videoId, ...l }) => ({
          ...l,
          id: l._id.toString(),
          completed: completedLessonIds.has(l._id.toString()),
        })),
        enrolledAt: enrollment?.paidAt ?? null,
        amountPaid: enrollment?.amountPaid ?? 0,
        ...progress,
      };
    });

    // In progress first, then not started, then finished.
    const rank = (c) => (c.percentComplete === 100 ? 2 : c.percentComplete > 0 ? 0 : 1);
    payload.sort((a, b) => rank(a) - rank(b) || b.percentComplete - a.percentComplete);

    res.json({
      courses: payload,
      summary: {
        courses: payload.length,
        completed: payload.filter((c) => c.percentComplete === 100).length,
        inProgress: payload.filter((c) => c.percentComplete > 0 && c.percentComplete < 100).length,
        lessonsCompleted: completedLessonIds.size,
      },
    });
  } catch (error) {
    console.error('Fetch my courses error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Progress tracking ───────────────────────────────────────────────────────

/**
 * Marks a lesson complete or incomplete. Requires an active enrollment for
 * paid courses, so progress cannot be recorded against locked content.
 */
app.put('/api/progress/lessons/:lessonId', requireAuth, async (req, res) => {
  try {
    const completed = req.body.completed !== false;
    const secondsWatched = Math.max(0, Number(req.body.secondsWatched) || 0);

    const lesson = await Lesson.findById(req.params.lessonId).select('courseId');
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    const course = await Course.findById(lesson.courseId).select('price lessons');
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (course.price > 0) {
      const enrollment = await Enrollment.findOne({
        userId: req.auth.userId,
        courseId: course._id,
        status: 'active',
      });
      if (!enrollment) {
        return res.status(402).json({
          message: 'Enroll in this course to track progress',
          code: 'payment_required',
        });
      }
    }

    await Progress.findOneAndUpdate(
      { userId: req.auth.userId, lessonId: lesson._id },
      {
        userId: req.auth.userId,
        courseId: course._id,
        lessonId: lesson._id,
        completed,
        secondsWatched,
        completedAt: completed ? new Date() : null,
        lastViewedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const completedLessons = await Progress.countDocuments({
      userId: req.auth.userId,
      courseId: course._id,
      completed: true,
    });

    const totalLessons = course.lessons.length;

    res.json({
      lessonId: lesson._id.toString(),
      courseId: course._id.toString(),
      completed,
      completedLessons,
      totalLessons,
      percentComplete: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Account settings ────────────────────────────────────────────────────────

/** Only the display name is editable. Email is immutable on the schema. */
app.patch('/api/account/profile', requireAuth, async (req, res) => {
  try {
    if ('email' in req.body) {
      return res.status(400).json({
        message: 'Email cannot be changed. It is your account identity.',
        code: 'email_immutable',
      });
    }

    const name = String(req.body.name || '').trim();
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ message: 'Name must be between 2 and 80 characters' });
    }

    const user = await User.findByIdAndUpdate(
      req.auth.userId,
      { name },
      { new: true, runValidators: true },
    );

    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/** Regenerates the assigned avatar. */
app.post('/api/account/avatar/shuffle', requireAuth, async (req, res) => {
  try {
    const next = randomAvatar();
    const user = await User.findByIdAndUpdate(req.auth.userId, next, { new: true });
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Shuffle avatar error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Account deletion request.
 *
 * The request is emailed to the site owner and actioned manually, rather than
 * the user deleting their own account with a confirmation link. The request is
 * also written to the database so it is not lost if email delivery fails.
 */
app.post('/api/account/deletion-request', requireAuth, async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim().slice(0, 500);

    // Rate limit: this endpoint sends the owner an email, so repeated clicks
    // must not become an inbox flood.
    const recent = await DeletionRequest.findOne({
      userId: req.auth.userId,
      status: 'pending',
      createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (recent) {
      return res.status(429).json({
        message:
          'You already have a deletion request pending. We will email you once it is processed.',
        code: 'already_requested',
      });
    }

    const enrollments = await Enrollment.countDocuments({ userId: req.auth.userId });

    const record = await DeletionRequest.create({
      userId: req.auth.userId,
      email: req.user.email,
      name: req.user.name,
      reason: reason || undefined,
      status: 'pending',
    });

    const mail = deletionRequestEmail({
      name: req.user.name,
      email: req.user.email,
      userId: req.auth.userId.toString(),
      enrollments,
      reason,
      requestedAt: record.createdAt.toISOString(),
    });

    const result = await sendMail({
      to: adminEmail(),
      replyTo: req.user.email,
      ...mail,
    });

    if (result.delivered) {
      record.notified = true;
      await record.save();
    }

    res.status(201).json({
      message:
        'Your deletion request has been sent. We will remove your account and ' +
        'email you to confirm, usually within a few business days.',
      // Lets the UI warn that mail is not configured on this server.
      emailConfigured: isMailConfigured(),
      emailDelivered: result.delivered,
    });
  } catch (error) {
    console.error('Deletion request error:', error);
    res.status(500).json({ message: 'Could not submit your deletion request' });
  }
});

// Real catalogue figures, computed from the database. No hardcoded values.
app.get('/api/stats', async (_req, res) => {
  try {
    const [totalCourses, freeCourses, categories, totalLessons, ratingAgg] = await Promise.all([
      Course.countDocuments({}),
      Course.countDocuments({ price: 0 }),
      Course.distinct('category'),
      Lesson.countDocuments({}),
      Course.aggregate([
        { $match: { rating: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ])
    ]);

    const avgRating = ratingAgg.length ? Number(ratingAgg[0].avg.toFixed(1)) : null;

    res.json({
      totalCourses,
      freeCourses,
      paidCourses: totalCourses - freeCourses,
      categories: categories.length,
      totalLessons,
      avgRating,
      currency: getCurrency(),
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Enrollments ─────────────────────────────────────────────────────────────

app.get('/api/enrollments', requireAuth, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ userId: req.auth.userId })
      .select('courseId status amountPaid currency paidAt createdAt')
      .lean();

    res.json({
      enrollments: enrollments.map((e) => ({
        courseId: e.courseId.toString(),
        status: e.status,
        amountPaid: e.amountPaid,
        currency: e.currency,
        paidAt: e.paidAt,
      })),
      // Convenience list of unlocked course ids.
      activeCourseIds: enrollments
        .filter((e) => e.status === 'active')
        .map((e) => e.courseId.toString()),
    });
  } catch (error) {
    console.error('Fetch enrollments error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Free courses only. A paid course can never be unlocked here; the price is
 * read from the database, so a tampered request body cannot make a paid
 * course look free.
 */
app.post('/api/enrollments/free', requireAuth, async (req, res) => {
  try {
    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ message: 'courseId is required' });

    const course = await Course.findById(courseId).select('price title');
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (course.price > 0) {
      return res.status(402).json({
        message: 'This course requires payment',
        code: 'payment_required',
      });
    }

    const enrollment = await Enrollment.findOneAndUpdate(
      { userId: req.auth.userId, courseId },
      {
        userId: req.auth.userId,
        courseId,
        status: 'active',
        amountPaid: 0,
        currency: getCurrency(),
        paidAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ status: enrollment.status, courseId });
  } catch (error) {
    console.error('Free enrollment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Payments ────────────────────────────────────────────────────────────────

/**
 * Step 2 and 3 of the flow: the client sends only a courseId, and the server
 * decides the amount. The browser never supplies a price.
 */
app.post('/api/payments/create-payment-intent', requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return stripeUnavailableResponse(res);

  try {
    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ message: 'courseId is required' });

    const course = await Course.findById(courseId).select('title price priceInPaise currency');
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (!course.price || course.price <= 0) {
      return res.status(400).json({
        message: 'This course is free. Use the free enrollment endpoint.',
        code: 'course_is_free',
      });
    }

    // Already paid for? Do not charge a second time.
    const existing = await Enrollment.findOne({ userId: req.auth.userId, courseId });
    if (existing?.status === 'active') {
      return res.status(409).json({
        message: 'You already have access to this course',
        code: 'already_enrolled',
      });
    }

    // Authoritative amount, in the smallest currency unit, straight from the DB.
    // Falls back to rupees*100 for any course seeded before priceInPaise existed.
    const amount = course.priceInPaise || Math.round(course.price * 100);
    if (!Number.isInteger(amount) || amount < 100) {
      console.error(`Course ${courseId} has an invalid amount: ${amount}`);
      return res.status(500).json({ message: 'Course pricing is misconfigured' });
    }

    // Reusing an open intent avoids stacking abandoned intents on retries.
    if (existing?.stripePaymentIntentId) {
      try {
        const previous = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
        const reusable = ['requires_payment_method', 'requires_confirmation', 'requires_action'];
        if (reusable.includes(previous.status) && previous.amount === amount) {
          return res.json({
            clientSecret: previous.client_secret,
            amount: previous.amount,
            currency: previous.currency,
            courseTitle: course.title,
            reused: true,
          });
        }
      } catch {
        // Intent is gone or unreadable; fall through and make a fresh one.
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: course.currency || getCurrency(),
      automatic_payment_methods: { enabled: true },
      // The webhook reads these back to decide who to grant access to.
      metadata: {
        userId: req.auth.userId.toString(),
        courseId: course._id.toString(),
        courseTitle: course.title.slice(0, 200),
      },
      description: `LearnSpace course: ${course.title}`.slice(0, 350),
      receipt_email: req.user.email,
    });

    // Record the attempt as pending. Access is NOT granted here.
    await Enrollment.findOneAndUpdate(
      { userId: req.auth.userId, courseId },
      {
        userId: req.auth.userId,
        courseId,
        status: 'pending',
        stripePaymentIntentId: paymentIntent.id,
        amountPaid: 0,
        currency: paymentIntent.currency,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      courseTitle: course.title,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({ message: error.message || 'Could not start payment' });
  }
});

/**
 * Safety net for the confirm step.
 *
 * The webhook is the source of truth, but it cannot reach localhost unless the
 * Stripe CLI is forwarding. This endpoint asks Stripe directly for the intent
 * status and grants access only if Stripe itself reports `succeeded`. It is
 * still server-verified: the client cannot assert success on its own.
 */
app.post('/api/payments/confirm', requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return stripeUnavailableResponse(res);

  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // The intent must belong to the caller.
    if (intent.metadata?.userId !== req.auth.userId.toString()) {
      return res.status(403).json({ message: 'This payment belongs to another account' });
    }

    if (intent.status !== 'succeeded') {
      return res.status(409).json({
        message: 'Payment has not completed yet',
        status: intent.status,
      });
    }

    await activateEnrollmentFromIntent(intent);

    res.json({
      status: 'active',
      courseId: intent.metadata.courseId,
      amountPaid: intent.amount_received ?? intent.amount,
      currency: intent.currency,
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ message: 'Could not verify payment' });
  }
});

// ─── Gated playback ──────────────────────────────────────────────────────────

/**
 * The only route that reveals a videoId. Free courses need a signed-in user;
 * paid courses need an `active` enrollment. Checked on every request, so a
 * client-side flag cannot unlock anything.
 */
app.get('/api/lessons/:lessonId/playback', requireAuth, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    const course = await Course.findById(lesson.courseId).select('price title');
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (course.price > 0) {
      const enrollment = await Enrollment.findOne({
        userId: req.auth.userId,
        courseId: course._id,
        status: 'active',
      });

      if (!enrollment) {
        return res.status(402).json({
          message: 'Enroll in this course to watch the lesson',
          code: 'payment_required',
        });
      }
    }

    // Verify the video still exists, and cache the result for a day so we are
    // not calling YouTube on every play.
    const dayMs = 24 * 60 * 60 * 1000;
    const stale = !lesson.checkedAt || Date.now() - lesson.checkedAt.getTime() > dayMs;

    if (stale) {
      const watchUrl = `https://www.youtube.com/watch?v=${lesson.videoId}`;
      const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
      try {
        const probe = await fetch(oembed, { signal: AbortSignal.timeout(5000) });
        lesson.verificationStatus = probe.ok ? 'verified' : 'failed';
      } catch {
        // A network hiccup should not block a paying customer, so keep the
        // previous verdict and simply retry on the next request.
        lesson.verificationStatus = lesson.verificationStatus || 'pending';
      }
      lesson.checkedAt = new Date();
      await lesson.save();
    }

    if (lesson.verificationStatus === 'failed') {
      return res.status(502).json({
        message: 'This video is currently unavailable from the provider',
        code: 'video_unavailable',
      });
    }

    res.json({
      embedUrl: `https://www.youtube-nocookie.com/embed/${lesson.videoId}?autoplay=1&rel=0&modestbranding=1`,
      provider: lesson.provider,
      verificationStatus: lesson.verificationStatus,
    });
  } catch (error) {
    console.error('Playback error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Unknown API routes must return JSON, not the SPA shell.
 *
 * Registered before the static/catch-all block below. Without this, a typo or a
 * route that only exists in a newer build falls through to `app.get('*')` and
 * responds with index.html and a 200, so the client tries to JSON.parse HTML
 * and reports a confusing error instead of a plain 404.
 */
app.use('/api', (req, res) => {
  res.status(404).json({
    message: `No such API route: ${req.method} /api${req.path}`,
    code: 'route_not_found',
  });
});

/**
 * Optionally serve the built client.
 *
 * On Render this service is API-only: the frontend is hosted on Vercel, and
 * `NODE_ENV=production` makes npm skip devDependencies, so Vite is not even
 * installed there. Gate on the build actually existing rather than on
 * NODE_ENV, so a missing client/dist cannot turn every non-API request into a
 * 500 from sendFile.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../client/dist');
const hasClientBuild = fs.existsSync(path.join(dist, 'index.html'));

if (hasClientBuild) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  // Pure API mode. Make that explicit instead of failing obscurely.
  app.get('/', (_req, res) =>
    res.json({
      service: 'learnspace-api',
      message: 'API only. The web app is hosted separately.',
      health: '/api/health',
    }),
  );
}

app.listen(port, '0.0.0.0', () => {
  console.log(`LearnSpace API running on port ${port}`);
  logStripeStatus();
});
