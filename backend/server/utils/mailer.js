const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

// Sends an email. If SMTP is not configured (placeholder in .env), logs and skips
// rather than failing the request — keeps local dev functional.
async function sendEmail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST || process.env.SMTP_HOST.includes('example.com')) {
    console.warn(`[mailer] SMTP not configured; skipping send to ${to}`);
    return null;
  }
  return transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendEmail };
