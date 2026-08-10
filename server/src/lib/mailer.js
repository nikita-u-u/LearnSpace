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

/** Where account-deletion requests are sent. */
export function adminEmail() {
  return process.env.ADMIN_EMAIL || 'nikitakashyap013@gmail.com';
}

export async function sendMail({ to, subject, text, html, replyTo }) {
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

  await tx.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
    // Lets the owner reply straight to the learner.
    ...(replyTo ? { replyTo } : {}),
  });
  return { delivered: true };
}

/** Escape user-supplied text before putting it in an HTML email body. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Notification sent to the site owner when a learner asks for their account to
 * be deleted. Deletion is then performed manually.
 */
export function deletionRequestEmail({ name, email, userId, enrollments, reason, requestedAt }) {
  const subject = `Account deletion request: ${email}`;

  const lines = [
    'A LearnSpace user has requested account deletion.',
    '',
    `Name:        ${name}`,
    `Email:       ${email}`,
    `User ID:     ${userId}`,
    `Enrollments: ${enrollments}`,
    `Requested:   ${requestedAt}`,
  ];

  if (reason) {
    lines.push('', 'Reason given:', reason);
  }

  lines.push(
    '',
    'To action this, delete the user document and their enrollment and',
    'progress records. Reply to this email to reach the user directly.',
    '',
    '— LearnSpace',
  );

  const text = lines.join('\n');

  const html = `
    <div style="font-family:Inter,Segoe UI,sans-serif;max-width:560px;color:#20293c">
      <h2 style="letter-spacing:-0.02em;margin:0 0 6px">Account deletion request</h2>
      <p style="color:#5a6478;margin:0 0 20px">A LearnSpace user asked for their account to be deleted.</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%">
        <tr><td style="padding:7px 0;color:#5a6478;width:120px">Name</td><td style="padding:7px 0"><strong>${escapeHtml(name)}</strong></td></tr>
        <tr><td style="padding:7px 0;color:#5a6478">Email</td><td style="padding:7px 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:7px 0;color:#5a6478">User ID</td><td style="padding:7px 0"><code>${escapeHtml(userId)}</code></td></tr>
        <tr><td style="padding:7px 0;color:#5a6478">Enrollments</td><td style="padding:7px 0">${escapeHtml(enrollments)}</td></tr>
        <tr><td style="padding:7px 0;color:#5a6478">Requested</td><td style="padding:7px 0">${escapeHtml(requestedAt)}</td></tr>
        ${reason ? `<tr><td style="padding:7px 0;color:#5a6478;vertical-align:top">Reason</td><td style="padding:7px 0">${escapeHtml(reason)}</td></tr>` : ''}
      </table>
      <p style="color:#5a6478;font-size:13px;margin-top:22px;padding-top:16px;border-top:1px solid #e3e7f0">
        Reply to this email to reach the user directly.
      </p>
    </div>
  `;

  return { subject, text, html };
}

export const isMailConfigured = smtpConfigured;
