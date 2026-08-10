import nodemailer from 'nodemailer';

/**
 * SMTP is optional. When it is not configured the app still works: the
 * confirmation link is logged to the server console instead of emailed.
 *
 * The link is never returned in an HTTP response. Doing so would let anyone
 * holding a stolen access token delete the account without inbox access,
 * which defeats the point of confirming by email.
 */
function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;

function getTransporter() {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

function fromAddress() {
  return process.env.MAIL_FROM || 'LearnSpace <no-reply@learnspace.dev>';
}

export async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();

  if (!tx) {
    console.warn(
      '\n─── EMAIL NOT SENT (SMTP not configured) ────────────────────────────\n' +
      `To:      ${to}\n` +
      `Subject: ${subject}\n\n` +
      `${text}\n` +
      '─────────────────────────────────────────────────────────────────────\n',
    );
    return { delivered: false, reason: 'smtp_not_configured' };
  }

  await tx.sendMail({ from: fromAddress(), to, subject, text, html });
  return { delivered: true };
}

export function deletionEmail({ name, confirmUrl, expiresMinutes }) {
  const subject = 'Confirm your LearnSpace account deletion';

  const text = [
    `Hi ${name},`,
    '',
    'We received a request to permanently delete your LearnSpace account.',
    '',
    'Confirm here (the link expires in ' + expiresMinutes + ' minutes):',
    confirmUrl,
    '',
    'This removes your profile, enrollments and course progress. Purchase',
    'records are retained only as long as tax rules require.',
    '',
    'If you did not request this, ignore this email and nothing will happen.',
    '',
    '— LearnSpace',
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Segoe UI,sans-serif;max-width:520px;color:#20293c">
      <h2 style="letter-spacing:-0.02em">Confirm account deletion</h2>
      <p>Hi ${name},</p>
      <p>We received a request to permanently delete your LearnSpace account.</p>
      <p style="margin:28px 0">
        <a href="${confirmUrl}"
           style="background:#2f5bd7;color:#fff;padding:13px 22px;border-radius:10px;
                  text-decoration:none;font-weight:700;display:inline-block">
          Delete my account
        </a>
      </p>
      <p style="color:#5a6478;font-size:14px">
        This link expires in ${expiresMinutes} minutes. Deleting removes your profile,
        enrollments and course progress.
      </p>
      <p style="color:#5a6478;font-size:14px">
        If you did not request this, ignore this email and nothing will happen.
      </p>
    </div>
  `;

  return { subject, text, html };
}

export const isMailConfigured = smtpConfigured;
