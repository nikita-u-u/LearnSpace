import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { api, formatMoney } from './lib/api';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const hasKey = publishableKey.startsWith('pk_') && !publishableKey.includes('replace_me');

// loadStripe must be called once, outside render, or the SDK re-initialises on
// every keystroke inside the card form.
const stripePromise = hasKey ? loadStripe(publishableKey, {
  developerTools: { assistant: { enabled: false } }
}) : null;

const appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#2f5bd7',
    colorText: '#20293c',
    colorDanger: '#c0392f',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    borderRadius: '12px',
    spacingUnit: '4px',
  },
};

/**
 * Owns steps 3 to 6 of the payment lifecycle:
 *   3. ask the backend for a PaymentIntent (amount decided server-side)
 *   4. collect payment details in Stripe's Payment Element
 *   5. confirm with Stripe
 *   6. have the backend verify the intent before unlocking
 */
export default function CheckoutModal({ course, onClose, onSuccess }) {
  const [intent, setIntent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Step 2: send only the courseId. Never a price.
  useEffect(() => {
    let active = true;

    if (!hasKey) {
      setError(
        'Payments are not configured. Add VITE_STRIPE_PUBLISHABLE_KEY to .env and restart the dev server.',
      );
      setLoading(false);
      return;
    }

    api
      .createPaymentIntent(course.id)
      .then((data) => {
        if (active) setIntent(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err.code === 'already_enrolled'
            ? 'You already have access to this course.'
            : err.message,
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [course.id]);

  const options = useMemo(
    () => (intent ? { clientSecret: intent.clientSecret, appearance } : null),
    [intent],
  );

  return (
    <div className="ls-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="ls-modal-panel ls-checkout"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="ls-modal-close" onClick={onClose} aria-label="Close checkout">
          ✕
        </button>

        <div className="ls-checkout-head">
          <div className="ls-section-label">Secure checkout</div>
          <h2>{course.title}</h2>
          <div className="ls-checkout-amount">
            {formatMoney((course.priceInPaise ?? course.price * 100), course.currency)}
            <small>one-time, lifetime access</small>
          </div>
        </div>

        {loading && (
          <div className="ls-checkout-loading">
            <span className="ls-inline-spinner" />
            Preparing secure payment…
          </div>
        )}

        {error && !loading && (
          <>
            <div className="ls-alert">{error}</div>
            <button className="ls-button ls-button-outline ls-wide" onClick={onClose}>
              Close
            </button>
          </>
        )}

        {options && !error && (
          <Elements stripe={stripePromise} options={options}>
            <PaymentForm
              intent={intent}
              courseId={course.id}
              onSuccess={onSuccess}
              onCancel={onClose}
            />
          </Elements>
        )}

        <p className="ls-checkout-note">
          Card details go straight to Stripe and never touch the LearnSpace server.
          Access unlocks only after Stripe confirms the payment.
        </p>
      </div>
    </div>
  );
}

function PaymentForm({ intent, courseId, onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  /**
   * If the Payment Element never mounts, the Pay button stays disabled with no
   * explanation. The most common cause is the publishable key belonging to a
   * different Stripe account than the secret key that created the
   * PaymentIntent, so say so rather than leaving a dead button.
   */
  useEffect(() => {
    if (ready || loadFailed) return;
    const timer = setTimeout(() => {
      if (!ready) {
        setLoadFailed(true);
        setMessage(
          'The payment form could not load. This usually means the Stripe ' +
          'publishable key belongs to a different account than the secret key ' +
          'used to create the payment. Check both keys are from the same Stripe account.',
        );
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [ready, loadFailed]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setMessage('');

    // Step 5: Stripe confirms. `redirect: 'if_required'` keeps cards inline and
    // only navigates away for methods that genuinely need a redirect (UPI,
    // net banking, 3DS challenge pages).
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: (() => {
          const u = new URL(window.location.href);
          u.searchParams.set('checkout', 'return');
          return u.toString();
        })(),
      },
      redirect: 'if_required',
    });

    if (error) {
      setMessage(error.message || 'Payment could not be completed.');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      // Step 6: the browser saying "succeeded" is not enough. Ask our server
      // to verify the intent with Stripe before unlocking anything.
      try {
        await api.confirmPayment(paymentIntent.id);
        onSuccess(courseId);
        return;
      } catch (err) {
        setMessage(
          `Payment went through but access is still syncing. ${err.message} ` +
          'Refresh in a moment, or contact support if it persists.',
        );
        setSubmitting(false);
        return;
      }
    }

    if (paymentIntent?.status === 'processing') {
      setMessage('Payment is processing. Access unlocks as soon as it clears.');
      setSubmitting(false);
      return;
    }

    setMessage('Payment was not completed.');
    setSubmitting(false);
  }

  return (
    <form className="ls-checkout-form" onSubmit={handleSubmit}>
      <PaymentElement
        onReady={() => setReady(true)}
        onLoadError={({ error }) => {
          setLoadFailed(true);
          setMessage(error?.message || 'The payment form failed to load.');
        }}
        options={{ layout: 'tabs' }}
      />

      {!ready && !loadFailed && (
        <div className="ls-checkout-loading">
          <span className="ls-inline-spinner" />
          Loading secure payment form…
        </div>
      )}

      {message && <div className="ls-alert">{message}</div>}

      <div className="ls-checkout-actions">
        <button
          type="submit"
          className="ls-button ls-button-blue ls-wide"
          disabled={!ready || submitting}
        >
          {submitting
            ? 'Processing…'
            : `Pay ${formatMoney(intent.amount, intent.currency)}`}
        </button>
        <button
          type="button"
          className="ls-button ls-button-outline ls-wide"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export { hasKey as isStripeKeyPresent };
