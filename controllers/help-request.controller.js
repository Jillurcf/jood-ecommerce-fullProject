// controllers/help-request.controller.js
'use strict';

/**
 * Secure, production-ready controller for Help/Support Requests
 * - Sanitizes input
 * - Handles file attachments safely
 * - Logs all errors clearly
 * - Sends admin and user emails (with error logging)
 */

require('dotenv').config();
const path = require('path');
const { pool } = require('../includes/conn');
const nodemailer = require('nodemailer');
const { removeUploadedFile } = require('../middleware/upload.help');

// -------------------------
// MAIL CONFIGURATION
// -------------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify mailer at startup
transporter
  .verify()
  .then(() => console.log('Mailer ready'))
  .catch((err) => console.warn('Mailer verification error:', err.message));

// -------------------------
// HELPERS
// -------------------------
const escapeHtml = (unsafe = '') =>
  String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) : s);

// Mail HTML templates
const helpNotificationHtml = ({ name, email, subject, message, created_at }) => `
<div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e0e0e0; border-radius:10px; background-color:#f9f9f9;">
  <div style="text-align:center; margin-bottom:20px;">
    <img src="https://telal-contracting.com/issa.png" style="width:80px; border-radius:50%;" alt="Company Logo">
  </div>
  <h2 style="color:#1a73e8; text-align:center;">New Help Request</h2>
  <p style="font-size:16px; color:#333;">A user submitted the help request form:</p>
  <table style="width:100%; border-collapse:collapse; margin:20px 0;">
    <tr><td style="padding:10px; background:#e8f0fe; border-radius:5px;"><strong>Name:</strong></td><td style="padding:10px; background:#e8f0fe; border-radius:5px;">${escapeHtml(name)}</td></tr>
    <tr><td style="padding:10px; background:#f1f3f4; border-radius:5px;"><strong>Email:</strong></td><td style="padding:10px; background:#f1f3f4; border-radius:5px;">${escapeHtml(email)}</td></tr>
    <tr><td style="padding:10px; background:#e8f0fe; border-radius:5px;"><strong>Subject:</strong></td><td style="padding:10px; background:#e8f0fe; border-radius:5px;">${escapeHtml(subject)}</td></tr>
    <tr><td style="padding:10px; background:#f1f3f4; border-radius:5px;"><strong>Message:</strong></td><td style="padding:10px; background:#f1f3f4; border-radius:5px;">${escapeHtml(message).replace(/\n/g, '<br>')}</td></tr>
    <tr><td style="padding:10px; background:#e8f0fe; border-radius:5px;"><strong>Submitted At:</strong></td><td style="padding:10px; background:#e8f0fe; border-radius:5px;">${escapeHtml(created_at)}</td></tr>
  </table>
  <div style="text-align:center; margin:20px 0;">
    <a href="${escapeHtml(process.env.APP_URL || 'http://localhost:4000')}/customer/support-and-help/help-support" style="background-color:#1a73e8; color:white; padding:12px 25px; text-decoration:none; border-radius:5px; font-weight:bold;">View in Admin</a>
  </div>
</div>
`;

const helpConfirmationHtml = ({ name, subject, message, created_at }) => `
<div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e0e0e0; border-radius:10px; background-color:#f9f9f9;">
  <div style="text-align:center; margin-bottom:20px;">
    <img src="https://telal-contracting.com/issa.png" style="width:80px; border-radius:50%;" alt="Company Logo">
  </div>
  <h2 style="color:#1a73e8; text-align:center;">Thanks for contacting us, ${escapeHtml(name)}!</h2>
  <p style="font-size:16px; color:#333;">We received your message and will respond shortly. Here's a copy:</p>
  <table style="width:100%; border-collapse:collapse; margin:20px 0;">
    <tr><td style="padding:10px; background:#e8f0fe; border-radius:5px;"><strong>Subject:</strong></td><td style="padding:10px; background:#e8f0fe; border-radius:5px;">${escapeHtml(subject)}</td></tr>
    <tr><td style="padding:10px; background:#f1f3f4; border-radius:5px;"><strong>Message:</strong></td><td style="padding:10px; background:#f1f3f4; border-radius:5px;">${escapeHtml(message).replace(/\n/g, '<br>')}</td></tr>
    <tr><td style="padding:10px; background:#e8f0fe; border-radius:5px;"><strong>Submitted At:</strong></td><td style="padding:10px; background:#e8f0fe; border-radius:5px;">${escapeHtml(created_at)}</td></tr>
  </table>
</div>
`;

// -------------------------
// RENDER HELP REQUEST PAGE
// -------------------------
exports.helpRequestPage = (req, res) => {
  res.render('customer/help-request', {
    csrfToken: typeof req.csrfToken === 'function' ? req.csrfToken() : null,
    pageTitle: 'Help / Support',
    errors: [],
    oldInput: {},
  });
};

// -------------------------
// SUBMIT HELP REQUEST
// -------------------------
exports.submitHelpRequest = async (req) => {
  const client = await pool.connect();
  let file = null;

  try {
    // ---------------------
    // Sanitize & truncate input
    // ---------------------
    const { body } = req;
    const name = truncate(String(body.name || '').trim(), 150);
    const email = truncate(String(body.email || '').trim(), 254);
    const phone = body.phone ? truncate(String(body.phone).trim(), 20) : null;
    const orderNumber = body.orderNumber ? truncate(String(body.orderNumber).trim(), 50) : null;
    const category = body.category ? truncate(String(body.category).trim(), 100) : null;
    const subject = truncate(String(body.subject || '').trim(), 200);
    const message = truncate(String(body.message || '').trim(), 5000);
    const preferredContact = ['email', 'phone'].includes(body.preferredContact) ? body.preferredContact : 'email';

    // ---------------------
    // File attachment info
    // ---------------------
    file = req.file;
    const attachment_filename = file ? file.originalname : null;
    const attachment_path = file ? path.relative(process.cwd(), file.path) : null;
    const attachment_mimetype = file ? file.mimetype : null;
    const attachment_size = file ? file.size : null;

    // ---------------------
    // Client metadata
    // ---------------------
    const ip_address = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
    const user_agent = req.get ? req.get('User-Agent') : null;

    // ---------------------
    // Database insert
    // ---------------------
    await client.query('BEGIN');

    const insertQuery = `
      INSERT INTO support_requests
      (name, email, phone, order_number, category, subject, message,
       attachment_filename, attachment_path, attachment_mimetype, attachment_size,
       preferred_contact, status, ip_address, user_agent, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open',$13,$14,NOW(),NOW())
      RETURNING id, created_at
    `;
    const values = [
      name, email, phone, orderNumber, category, subject, message,
      attachment_filename, attachment_path, attachment_mimetype, attachment_size,
      preferredContact, ip_address, user_agent,
    ];

    const { rows } = await client.query(insertQuery, values);
    if (!rows[0]) throw new Error('Failed to insert help request');

    const id = rows[0].id;
    const created_at = rows[0].created_at.toISOString().replace('T', ' ').replace('Z', '');

    // ---------------------
    // Get admin recipients
    // ---------------------
    const adminsRes = await client.query(`SELECT aemail FROM admin_info WHERE status=true AND role='Admin' AND aemail IS NOT NULL`);
    const adminEmails = adminsRes.rows.map(r => r.aemail).filter(Boolean);
    const adminRecipients = adminEmails.length ? adminEmails.join(',') : process.env.FALLBACK_ADMIN_EMAIL || process.env.FROM_EMAIL;

    await client.query('COMMIT');

    const helpObj = { name, email, subject, message, created_at };

    // ---------------------
    // Send emails (async, fire-and-forget)
    // ---------------------
    transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: adminRecipients,
      subject: `📬 New Help Request: ${subject}`,
      text: `New help request\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage:\n${message}`,
      html: helpNotificationHtml(helpObj),
      replyTo: email,
    }).catch(err => console.error('Admin email error:', err));

    transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: `Thanks for contacting us — ${subject}`,
      text: `Hi ${name},\nThanks for contacting us.\nSubject: ${subject}\nMessage:\n${message}`,
      html: helpConfirmationHtml(helpObj),
    }).catch(err => console.error('User email error:', err));

    return { success: true, message: 'Help request submitted.', id };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Help request submission error:', err);

    // Remove uploaded file if DB failed
    if (file?.path) {
      try {
        await removeUploadedFile(file.path);
      } catch (e) {
        console.warn('Failed to remove uploaded file after DB error:', e);
      }
    }

    return { success: false, message: 'Failed to submit help request. Please try again later.' };
  } finally {
    client.release();
  }
};
