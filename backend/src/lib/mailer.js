import nodemailer from "nodemailer";
import { env } from "../config/index.js";
function isSmtpConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
}
function createMailer() {
  if (!isSmtpConfigured()) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });
}
async function sendMail(message) {
  const fromEmail = env.FROM_EMAIL || env.SMTP_USER || "no-reply@example.com";
  const transporter = createMailer();
  if (!transporter) {
    if (env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured.");
    }
    console.log("\n[mailer:dev] SMTP not configured \u2014 mail logged instead");
    console.log(`[mailer:dev] To: ${message.to}`);
    console.log(`[mailer:dev] Subject: ${message.subject}`);
    console.log(`[mailer:dev] Body: ${message.text || "(html only)"}
`);
    return;
  }
  await transporter.sendMail({
    from: fromEmail,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text
  });
}
export {
  createMailer,
  sendMail
};
