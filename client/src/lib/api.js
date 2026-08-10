const TOKEN_KEY = 'learnspace.token';

/**
 * Empty by default, which keeps requests same-origin and works both locally
 * (Vite proxy) and on Vercel (rewrite to the Render API, see vercel.json).
 * Set VITE_API_URL to call the Render service directly instead.
 */
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Thin fetch wrapper that attaches the bearer token and turns non-2xx
 * responses into ApiError, so callers can branch on status/code.
 */
async function request(path, { method = 'GET', body, auth = false, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = getToken();
    if (!token) throw new ApiError('Sign in to continue', 401, 'no_token');
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(
      payload?.message || `Request failed (${res.status})`,
      res.status,
      payload?.code,
    );
  }

  return payload;
}

export const api = {
  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  me: () => request('/auth/me', { auth: true }),

  // Catalogue
  courses: (params, signal) => request(`/courses?${params}`, { signal }),
  myCourses: () => request('/courses/mine', { auth: true }),
  stats: () => request('/stats'),

  // Enrollment
  enrollments: () => request('/enrollments', { auth: true }),
  enrollFree: (courseId) =>
    request('/enrollments/free', { method: 'POST', body: { courseId }, auth: true }),

  // Payments
  createPaymentIntent: (courseId) =>
    request('/payments/create-payment-intent', {
      method: 'POST',
      body: { courseId },
      auth: true,
    }),
  confirmPayment: (paymentIntentId) =>
    request('/payments/confirm', {
      method: 'POST',
      body: { paymentIntentId },
      auth: true,
    }),

  // Gated playback
  playback: (lessonId) => request(`/lessons/${lessonId}/playback`, { auth: true }),

  // Progress
  setLessonProgress: (lessonId, body) =>
    request(`/progress/lessons/${lessonId}`, { method: 'PUT', body, auth: true }),

  // Account settings
  updateProfile: (body) => request('/account/profile', { method: 'PATCH', body, auth: true }),
  shuffleAvatar: () => request('/account/avatar/shuffle', { method: 'POST', body: {}, auth: true }),
  requestDeletion: (reason) =>
    request('/account/deletion-request', {
      method: 'POST',
      body: { reason },
      auth: true,
    }),
};

/** ₹1,299 from 129900 paise. */
export function formatMoney(minorUnits, currency = 'inr') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format((minorUnits || 0) / 100);
}

/** ₹1,299 from a whole-rupee price. */
export function formatPrice(rupees, currency = 'inr') {
  return formatMoney((rupees || 0) * 100, currency);
}
