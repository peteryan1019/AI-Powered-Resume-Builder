import { Resend } from 'resend';

/**
 * Email delivery via the Resend HTTP API.
 *
 * The production droplet blocks outbound SMTP ports (25/465/587), so SMTP-based
 * sending times out. Resend sends over HTTPS (443), which is open. Config:
 *
 *   - RESEND_API_KEY — the Resend API key.
 *   - MAIL_FROM      — the From address, which MUST be on a domain verified in
 *                      Resend (e.g. "Tailr <login@contact.resume-builder.dev>"),
 *                      or Resend rejects the send.
 *
 * Local dev with no API key falls back to logging the code to the console so
 * sign-in still works without sending a real email.
 */

const FROM = process.env.MAIL_FROM || 'Tailr <login@contact.resume-builder.dev>';

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

/** Sends the one-time login code for passwordless sign-in. */
export async function sendLoginCodeEmail(to: string, code: string): Promise<void> {
  const subject = `Your Tailr sign-in code: ${code}`;
  const text =
    `Your Tailr sign-in code is ${code}\n\n` +
    `It expires in 10 minutes and can be used once. ` +
    `If you did not try to sign in, you can ignore this email.`;
  const html =
    `<p>Your Tailr sign-in code is:</p>` +
    `<p style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:12px 0">${code}</p>` +
    `<p>It expires in 10 minutes and can be used once. ` +
    `If you did not try to sign in, you can ignore this email.</p>`;

  // Dev fallback: no API key → print the code so local sign-in still works.
  if (!resend) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is required in production.');
    }
    console.log(`[mailer] RESEND_API_KEY not set — login code for ${to}: ${code}`);
    return;
  }

  const { error } = await resend.emails.send({ from: FROM, to, subject, text, html });

  // The Resend SDK returns an error object rather than throwing; surface it so
  // the caller's catch logs it.
  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? JSON.stringify(error)}`);
  }
}
