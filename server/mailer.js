// ---------------------------------------------------------------------------
// Optional transactional mail for the contact form.
//
// Nothing here is required to run the site: when SMTP_* is absent from
// server/.env every call is a no-op and the message simply stays in the
// admin panel, exactly as before. That keeps the project dependency-free for
// anyone who does not want to send mail, and keeps the contact form working if
// the mail server is down (a mail failure never fails the request).
//
// server/.env:
//   MAIL_TO     = himoubtz2@gmail.com     <- where messages are delivered
//   MAIL_FROM   = website@yourdomain.tld  <- optional, defaults to SMTP_USER
//   SMTP_HOST   = smtp.gmail.com
//   SMTP_PORT   = 587
//   SMTP_SECURE = 0                       <- 1 only for implicit TLS (port 465)
//   SMTP_USER   = himoubtz2@gmail.com
//   SMTP_PASS   = <Google app password>   <- never committed, never printed
// ---------------------------------------------------------------------------
import './env.js';

let transport = null;
let transportFor = '';
let lastError = '';

function config() {
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').trim() === '1',
    user: (process.env.SMTP_USER || '').trim(),
    pass: (process.env.SMTP_PASS || '').trim(),
    from: (process.env.MAIL_FROM || process.env.SMTP_USER || '').trim(),
    to: (process.env.MAIL_TO || '').trim(),
  };
}

const REQUIRED = [
  ['SMTP_HOST', (c) => c.host],
  ['SMTP_USER', (c) => c.user],
  ['SMTP_PASS', (c) => c.pass],
  ['MAIL_TO', (c) => c.to],
];

/** Safe to expose to the authenticated admin panel: flags only, never values. */
export function mailStatus() {
  const c = config();
  return {
    enabled: REQUIRED.every(([, read]) => read(c)),
    missing: REQUIRED.filter(([, read]) => !read(c)).map(([name]) => name),
    to: c.to,
    lastError,
  };
}

async function getTransport() {
  const c = config();
  const signature = `${c.host}|${c.port}|${c.secure}|${c.user}`;
  if (transport && transportFor === signature) return transport;
  const { createTransport } = await import('nodemailer');
  transport = createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    // 10s connect + 10s greeting is plenty for a form submission; a slow mail
    // server must never make a visitor wait on the contact form.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: c.user, pass: c.pass },
  });
  transportFor = signature;
  return transport;
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const oneLine = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Deliver one contact-form message. Never throws: a broken mail server must not
 * turn a successful submission into an error for the visitor.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function notifyNewMessage(message) {
  const status = mailStatus();
  if (!status.enabled) return { sent: false, reason: 'not_configured' };
  const c = config();
  const name = oneLine(message.name, 80);
  const subject = oneLine(message.subject, 160);
  const visitorEmail = oneLine(message.email, 120);
  const body = oneLine(message.body, 3000);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const mailer = await getTransport();
    await mailer.sendMail({
      from: c.from || c.user,
      to: c.to,
      replyTo: visitorEmail,
      subject: `[Khmisti] ${subject || '(no subject)'} — ${name || 'visitor'}`,
      text: [
        `New contact-form message — ${stamp} UTC`,
        ``,
        `Name:    ${name}`,
        `E-mail:  ${visitorEmail}`,
        `Subject: ${subject}`,
        ``,
        body,
        ``,
        `Sent from the school website contact form.`,
      ].join('\n'),
      html: `<div style="font-family:Segoe UI,Tahoma,Arial,sans-serif;font-size:15px;line-height:1.6;color:#101418">
  <p style="margin:0 0 12px"><strong>${escapeHtml(subject || '(no subject)')}</strong></p>
  <table cellpadding="4" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
    <tr><td style="color:#49534f">${'Name'}</td><td><strong>${escapeHtml(name)}</strong></td></tr>
    <tr><td style="color:#49534f">${'E-mail'}</td><td dir="ltr"><a href="mailto:${escapeHtml(visitorEmail)}">${escapeHtml(visitorEmail)}</a></td></tr>
    <tr><td style="color:#49534f">${'Received'}</td><td dir="ltr">${escapeHtml(stamp)} UTC</td></tr>
  </table>
  <div style="white-space:pre-wrap;padding:14px 16px;border:1px solid #e2ddd5;border-radius:12px;background:#faf8f5">${escapeHtml(body)}</div>
  <p style="margin:16px 0 0;color:#6b6b6b;font-size:13px">${'Reply to this e-mail to answer the visitor directly.'}</p>
</div>`,
    });
    lastError = '';
    return { sent: true };
  } catch (error) {
    lastError = String(error?.message || error).slice(0, 200);
    console.error('[mail] delivery failed:', lastError);
    return { sent: false, reason: 'send_failed' };
  }
}
