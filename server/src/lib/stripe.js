import Stripe from 'stripe';

/**
 * Everything here is resolved lazily.
 *
 * Reading process.env at module load coupled this file to import ordering:
 * ES modules are evaluated before the importing module's body, so a
 * dotenv.config() call in index.js had not run yet. Lazy getters make the
 * module safe regardless of when it is imported.
 */

function readKey() {
  return process.env.STRIPE_SECRET_KEY || '';
}

function readWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

/** The repo ships placeholders like `sk_test_replace_me`; treat those as unset. */
function isPlaceholder(value) {
  return !value || value.includes('replace_me');
}

export function isStripeConfigured() {
  const key = readKey();
  return key.startsWith('sk_') && !isPlaceholder(key);
}

export function isWebhookConfigured() {
  const secret = readWebhookSecret();
  return secret.startsWith('whsec_') && !isPlaceholder(secret);
}

export function getWebhookSecret() {
  return readWebhookSecret();
}

export function getCurrency() {
  return (process.env.CURRENCY || 'inr').toLowerCase();
}

let client = null;

/** Returns a memoised Stripe client, or null when keys are not configured. */
export function getStripe() {
  if (!isStripeConfigured()) return null;
  if (!client) {
    client = new Stripe(readKey(), { apiVersion: '2025-09-30.clover' });
  }
  return client;
}

export function stripeUnavailableResponse(res) {
  return res.status(503).json({
    message:
      'Payments are not configured on this server. Add STRIPE_SECRET_KEY and ' +
      'VITE_STRIPE_PUBLISHABLE_KEY to .env, then restart.',
    code: 'stripe_not_configured',
  });
}

/** Called once from index.js after env has loaded, so the log is accurate. */
export function logStripeStatus() {
  if (!isStripeConfigured()) {
    console.warn(
      '⚠️  Stripe is not configured (STRIPE_SECRET_KEY missing or placeholder).\n' +
      '    Free enrollment works. Paid checkout returns 503.',
    );
  } else if (!isWebhookConfigured()) {
    console.warn(
      '⚠️  STRIPE_WEBHOOK_SECRET is not set. Payments still complete via the\n' +
      '    verified /api/payments/confirm fallback, but webhook delivery is\n' +
      '    rejected. Run: stripe listen --forward-to localhost:4000/api/webhooks/stripe',
    );
  }
}
