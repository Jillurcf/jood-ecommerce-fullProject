// controllers/admin.controller.js

require("dotenv").config();
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { pool } = require("../includes/conn");

/* =========================
   GENERATE ADMIN ID
========================= */
const generateAdminId = (firstName) => {
  const cleanName = firstName
    .trim()
    .replace(/\s+/g, "")
    .substring(0, 6)
    .toUpperCase();

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(
    now.getMonth() + 1
  ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const randomNum = Math.floor(100000 + Math.random() * 900000);

  return `${cleanName}_${dateStr}_${randomNum}`;
};

/* =========================
   GENERATE TEMP PASSWORD
========================= */
const generateTempPassword = (length = 12) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
  let password = "";

  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
};

/* =========================
   MAIL CONFIG
========================= */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify()
  .then(() => console.log("Mailer ready"))
  .catch(err => console.warn("Mailer error:", err.message));

/* =========================
   SEND CREDENTIAL EMAIL
========================= */
const sendAdminCredentialsEmail = async ({
  toEmail,
  adminId,
  tempPassword,
  firstName,
}) => {
  const loginUrl = `${process.env.APP_URL || "http://localhost:3000"}/admin/sign-in`;

  return transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: toEmail,
    subject: "🚀 Your Admin Account Access is Ready!",
    text: `
Hello ${firstName},

Your admin account has been created successfully.

Admin ID: ${adminId}
Email: ${toEmail}
Temporary Password: ${tempPassword}

Login here: ${loginUrl}

Please change your password after login.
  `,
    html: `
  <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e0e0e0; border-radius:10px; background-color:#f9f9f9;">
    <div style="text-align:center; margin-bottom:20px;">
      <img src="https://telal-contracting.com/issa.png" style="width:80px; border-radius:50%;" alt="Company Logo">
    </div>

    <h2 style="color:#1a73e8; text-align:center;">Welcome, ${firstName}!</h2>

    <p style="font-size:16px; color:#333;">Your <strong>admin account</strong> has been successfully created. Here are your access details:</p>

    <table style="width:100%; border-collapse:collapse; margin:20px 0;">
      <tr>
        <td style="padding:10px; background:#e8f0fe; border-radius:5px;"><strong>Admin ID:</strong></td>
        <td style="padding:10px; background:#e8f0fe; border-radius:5px;">${adminId}</td>
      </tr>
      <tr>
        <td style="padding:10px; background:#f1f3f4; border-radius:5px;"><strong>Username:</strong></td>
        <td style="padding:10px; background:#f1f3f4; border-radius:5px;">${toEmail}</td>
      </tr>
      <tr>
        <td style="padding:10px; background:#e8f0fe; border-radius:5px;"><strong>Temporary Password:</strong></td>
        <td style="padding:10px; background:#e8f0fe; border-radius:5px;">${tempPassword}</td>
      </tr>
    </table>

    <div style="text-align:center; margin:20px 0;">
      <a href="${loginUrl}" style="background-color:#1a73e8; color:white; padding:12px 25px; text-decoration:none; border-radius:5px; font-weight:bold;">Login to Your Account</a>
    </div>

    <p style="font-size:14px; color:#555;">⚠️ <strong>Please change your password immediately</strong> after logging in for security purposes.</p>

    <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;">

    <p style="font-size:12px; color:#999; text-align:center;">Telal Contracting | Your trusted partner</p>
  </div>
  `,
  });
};

/* =========================
   RENDER PAGES
========================= */
exports.showLogin = (req, res) => {
  res.render("admin/sign-in");
};

exports.showSignup = (req, res) => {
  res.render("admin/sign-up");
};

/* =========================
   LOGIN ADMIN
========================= */
exports.loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render("admin/sign-in", {
      error: "Email and password are required",
    });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM admin_reg WHERE aemail = $1 AND status = true",
      [email]
    );

    if (rows.length === 0) {
      return res.render("admin/sign-in", { error: "Invalid credentials" });
    }

    const admin = rows[0];
    const isMatch = await bcrypt.compare(password, admin.apassword);

    if (!isMatch) {
      return res.render("admin/sign-in", { error: "Invalid credentials" });
    }

    req.session.admin = {
      admin_id: admin.admin_id,
      email: admin.aemail,
    };

    await pool.query(
      "UPDATE admin_reg SET login = true, login_datetime = NOW() WHERE admin_id = $1",
      [admin.admin_id]
    );

    res.redirect("/admin");
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).send("Server error");
  }
};

/* =========================
   REGISTER ADMIN
========================= */
exports.registerAdmin = async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    dob,
    whatsapp,
    phone,
    address1,
    address2,
    gender,
    role,
  } = req.body;

  if (!first_name || !last_name || !email) {
    return res.render("admin/sign-up", {
      error: "First name, last name and email are required",
    });
  }

  const image = req.file ? req.file.filename : null;
  const admin_id = generateAdminId(first_name);
  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const emailCheck = await client.query(
      `SELECT 1 FROM admin_reg WHERE aemail = $1
       UNION
       SELECT 1 FROM admin_info WHERE aemail = $1`,
      [email]
    );

    if (emailCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.render("admin/sign-up", {
        error: "Email already exists",
      });
    }

    await client.query(
      `INSERT INTO admin_info
      (fname, lname, admin_id, aemail, dateofbirth, image, whatsapp, phone,
       address_temp, address_per, gender, role, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)`,
      [
        first_name,
        last_name,
        admin_id,
        email,
        dob || null,
        image,
        whatsapp || null,
        phone || null,
        address1 || null,
        address2 || null,
        gender || null,
        role || "Admin",
      ]
    );

    await client.query(
      `INSERT INTO admin_reg
      (admin_id, aemail, apassword, status, login)
      VALUES ($1,$2,$3,true,false)`,
      [admin_id, email, hashedPassword]
    );

    await client.query("COMMIT");

    await sendAdminCredentialsEmail({
      toEmail: email,
      adminId: admin_id,
      tempPassword,
      firstName: first_name,
    });
    req.session.success =
      "Admin registered successfully. Login credentials have been sent to email.";
    res.redirect("/admin/sign-in");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("REGISTER ERROR:", err);
    req.session.error = "Something went wrong. Please try again.";
    res.render("admin/sign-up", {
      error: "Failed to create admin",
    });
  } finally {
    client.release();
  }
};
