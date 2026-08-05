import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Email delivery.
 *
 * nodemailer is only an SMTP *client* — it still needs an SMTP endpoint to hand
 * mail to. There is no zero-cost way to deliver mail reliably from scratch
 * (deliverability needs a reputable sending domain with SPF/DKIM), so:
 *
 *   - Production / real delivery: set SMTP_HOST / SMTP_PORT / SMTP_USER /
 *     SMTP_PASS (e.g. a free Gmail address with an app password). No code change.
 *   - Local dev with nothing configured: we fall back to nodemailer's Ethereal
 *     test account, which needs no signup and returns a preview URL instead of
 *     actually delivering. The URL is logged so you can open the email.
 */

const FROM = process.env.MAIL_FROM || 'Tailr <no-reply@tailr.local>';

let transporterPromise: Promise<Transporter> | null = null;

function buildTransporter(): Promise<Transporter> {
  const host = process.env.SMTP_HOST;

  if (host) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host,
      port,
      // 465 = implicit TLS; anything else upgrades via STARTTLS.
      secure: port === 465,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    return Promise.resolve(transporter);
  }

  // No SMTP configured — dev fallback. Ethereal captures the message and gives
  // a preview URL; nothing is delivered to the real recipient.
  return nodemailer.createTestAccount().then((testAccount) =>
    nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    }),
  );
}

function getTransporter(): Promise<Transporter> {
  if (!transporterPromise) {
    transporterPromise = buildTransporter();
  }
  return transporterPromise;
}

async function sendMail(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({ from: FROM, ...message });

  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    // Dev (Ethereal) — surface the link so the email can be opened.
    console.log(`[mailer] preview URL for ${message.to}: ${preview}`);
  }
}

/** Sends the one-time login code for passwordless sign-in. */
export async function sendLoginCodeEmail(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: `Your Tailr sign-in code: ${code}`,
    text:
      `Your Tailr sign-in code is ${code}\n\n` +
      `It expires in 10 minutes and can be used once. ` +
      `If you did not try to sign in, you can ignore this email.`,
    html:
      `<p>Your Tailr sign-in code is:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:12px 0">${code}</p>` +
      `<p>It expires in 10 minutes and can be used once. ` +
      `If you did not try to sign in, you can ignore this email.</p>`,
  });
}
