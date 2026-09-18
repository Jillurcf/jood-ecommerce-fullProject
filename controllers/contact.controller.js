require("dotenv").config();
const { pool } = require("../includes/conn");
const nodemailer = require("nodemailer");

// =========================
// MAIL CONFIG
// =========================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter
  .verify()
  .then(() => console.log("Mailer ready"))
  .catch((err) => console.warn("Mailer error:", err.message));

// =========================
// HELPERS
// =========================
const escapeHtml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const stripHtml = (str = "") =>
  String(str)
    .replace(/<script.*?>.*?<\/script>/gis, "")
    .replace(/<[^>]*>/g, "");

const normalizeText = (value = "") =>
  stripHtml(String(value || "").trim()).replace(/\s+/g, " ");

const truncate = (value = "", max = 0) =>
  String(value || "").length > max ? String(value).slice(0, max) : String(value || "");

const containsLink = (text = "") =>
  /(https?:\/\/|www\.|\.com|\.net|\.org|\.co|ftp:\/\/|mailto:|tel:)/i.test(String(text));

const isValidName = (name = "") =>
  /^[A-Za-z\s'-]{2,150}$/.test(String(name));

const isValidEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));

const isValidSubject = (subject = "") =>
  /^[A-Za-z\s'.,!?&()\-_/]{3,200}$/.test(String(subject));

const formatDateTime = (date) => {
  try {
    return new Date(date).toISOString().replace("T", " ").replace("Z", "");
  } catch {
    return "";
  }
};

const getLogoUrl = () =>
  process.env.BRAND_LOGO_URL ||
  `${process.env.APP_URL || "http://localhost:3000"}/customer/images/web-img-vid/logo.png`;

const adminEmailTemplate = ({ name, email, subject, message, created_at }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #ddd;border-radius:10px;background:#fff;">
  <div style="text-align:center;margin-bottom:20px;">
    <img src="${escapeHtml(getLogoUrl())}" width="80" alt="JOOD" style="display:inline-block;">
  </div>

  <h2 style="text-align:center;color:#f59e0b;margin:0 0 20px;">New Contact Message (JOOD)</h2>

  <p><strong>Name:</strong> ${escapeHtml(name)}</p>
  <p><strong>Email:</strong> ${escapeHtml(email)}</p>
  <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
  <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
  <p><strong>Time:</strong> ${escapeHtml(created_at)}</p>

  <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">

  <p style="text-align:center;margin:0;">
    <a href="${escapeHtml(process.env.APP_URL || "http://localhost:3000")}/admin/contacts"
       style="background:#f59e0b;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">
      View Admin Panel
    </a>
  </p>
</div>
`;

const userEmailTemplate = ({ name, subject, message, created_at }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #ddd;border-radius:10px;background:#fff;">
  <div style="text-align:center;margin-bottom:20px;">
    <img src="${escapeHtml(getLogoUrl())}" width="80" alt="JOOD" style="display:inline-block;">
  </div>

  <h2 style="text-align:center;color:#f59e0b;margin:0 0 20px;">Thanks for contacting JOOD, ${escapeHtml(name)}!</h2>

  <p style="margin:0 0 12px;">We received your message and will respond soon.</p>

  <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
  <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
  <p><strong>Time:</strong> ${escapeHtml(created_at)}</p>
</div>
`;

// =========================
// RENDER CONTACT PAGE
// =========================
exports.contactUs = (req, res) => {
  res.render("customer/support-and-help/contact-us", {
    csrfToken: req.csrfToken(),
    pageTitle: "Contact Us",
    errors: [],
    oldInput: {},
  });
};

// =========================
// SUBMIT CONTACT
// =========================
exports.submitContact = async (req) => {
  try {
    let { name = "", email = "", subject = "", message = "" } = req.body || {};

    // =========================
    // CLEAN INPUTS
    // =========================
    name = truncate(normalizeText(name), 150);
    email = truncate(normalizeText(email), 254);
    subject = truncate(normalizeText(subject), 200);
    message = truncate(stripHtml(String(message || "").trim()), 5000);

    // =========================
    // SERVER-SIDE VALIDATION
    // =========================
    if (!name || !email || !subject || !message) {
      return { success: false, message: "All fields are required." };
    }

    if (!isValidName(name)) {
      return { success: false, message: "Name must contain letters only." };
    }

    if (!isValidEmail(email)) {
      return { success: false, message: "Invalid email format." };
    }

    if (containsLink(name) || containsLink(email) || containsLink(subject) || containsLink(message)) {
      return { success: false, message: "Links are not allowed in form fields." };
    }

    if (!isValidSubject(subject)) {
      return { success: false, message: "Subject can contain text only." };
    }

    if (containsLink(message)) {
      return { success: false, message: "Links are not allowed in message." };
    }

    // =========================
    // SAVE TO DATABASE
    // =========================
    const client = await pool.connect();

    let savedRow = null;
    let adminEmails = [];

    try {
      await client.query("BEGIN");

      const insertResult = await client.query(
        `INSERT INTO contact (name, email, subject, message, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, created_at`,
        [name, email, subject, message]
      );

      savedRow = insertResult.rows[0];

      const adminsRes = await client.query(
        `SELECT aemail
         FROM admin_info
         WHERE status = true
           AND role = 'Admin'
           AND aemail IS NOT NULL`
      );

      adminEmails = adminsRes.rows
        .map((r) => r.aemail)
        .filter(Boolean);

      await client.query("COMMIT");
    } catch (dbErr) {
      await client.query("ROLLBACK");
      console.error("Contact DB error:", dbErr);
      return {
        success: false,
        message: "Something went wrong. Please try again later.",
      };
    } finally {
      client.release();
    }

    if (!savedRow) {
      return {
        success: false,
        message: "Something went wrong. Please try again later.",
      };
    }

    const created_at = formatDateTime(savedRow.created_at);
    const data = { name, email, subject, message, created_at };

    const adminTo = adminEmails.length
      ? adminEmails.join(",")
      : process.env.FALLBACK_ADMIN_EMAIL || process.env.FROM_EMAIL;

    // =========================
    // SEND EMAILS SAFELY
    // =========================
    const mailTasks = [];

    if (adminTo) {
      mailTasks.push(
        transporter.sendMail({
          from: process.env.FROM_EMAIL,
          to: adminTo,
          subject: `📩 New Contact - ${subject}`,
          html: adminEmailTemplate(data),
          text: `New contact message\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage:\n${message}`,
          replyTo: email,
        })
      );
    }

    if (email) {
      mailTasks.push(
        transporter.sendMail({
          from: process.env.FROM_EMAIL,
          to: email,
          subject: `We received your message - JOOD`,
          html: userEmailTemplate(data),
          text: `Hi ${name},\nWe received your message.\nSubject: ${subject}\nMessage:\n${message}`,
        })
      );
    }

    Promise.allSettled(mailTasks).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const label = index === 0 ? "Admin email error" : "User email error";
          console.error(label + ":", result.reason);
        }
      });
    });

    return { success: true, message: "Message sent successfully!" };
  } catch (err) {
    console.error("Contact error:", err);
    return {
      success: false,
      message: "Something went wrong. Please try again later.",
    };
  }
};