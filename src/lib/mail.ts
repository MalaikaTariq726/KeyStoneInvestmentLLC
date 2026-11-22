import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";

export function isMailConfigured() {
  return Boolean(env.smtp.host && env.smtp.user && env.smtp.pass && env.smtp.from);
}

export async function sendLoginCode(to: string, name: string, code: string) {
  if (!isMailConfigured()) {
    if (env.isProduction) throw new Error("Email sending is not configured (SMTP_* variables).");
    // Development only: no mailbox configured yet, so show the code in the server console.
    console.log(`\n[dev] Sign-in code for ${to}: ${code}\n`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });

  const greeting = name ? `Hi ${escapeHtml(name.split(" ")[0])},` : "Hi,";
  await transporter.sendMail({
    from: `"KeyStone Portal" <${env.smtp.from}>`,
    to,
    subject: `${code} is your KeyStone sign-in code`,
    text: `${greeting.replace(/<[^>]+>/g, "")}\n\nYour KeyStone portal sign-in code is ${code}.\nIt expires in 10 minutes. If you didn't try to sign in, you can ignore this email.\n`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#0F1535">
        <div style="font-weight:800;font-size:18px;color:#F15A24;letter-spacing:.5px">KEYSTONE</div>
        <div style="font-size:12px;font-weight:700;color:#2B3990;margin-bottom:24px">Investment LLC</div>
        <p style="font-size:15px">${greeting}</p>
        <p style="font-size:15px">Use this code to sign in to the KeyStone employee portal:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;background:#F5F7FC;border:1px solid #E7EAF3;border-radius:14px;padding:18px;text-align:center;margin:18px 0">${code}</div>
        <p style="font-size:13px;color:#5B6280">It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>
      </div>`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
