import 'server-only'
import { Resend } from 'resend'
import { env } from './env'

export function passwordChangeMessage() {
  const resetUrl = `${env.appUrl().replace(/\/$/, '')}/forgot-password`
  return {
    subject: 'Your Careerely password has been changed',
    text: `Your Careerely password was changed successfully.\n\nIf you made this change, no further action is needed. If you did not change your password, reset it immediately at ${resetUrl} and contact hello@careerely.ai.`,
    html: `
      <div style="background:#f7f7f5;padding:40px 16px;font-family:Arial,sans-serif;color:#171717">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e7e2;border-radius:18px;padding:36px">
          <div style="font-size:24px;font-weight:700;margin-bottom:32px">Careerely</div>
          <h1 style="font-size:28px;line-height:1.2;margin:0 0 18px">Your password has been changed</h1>
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px">Your Careerely password was changed successfully.</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 24px">If you made this change, no further action is needed.</p>
          <div style="background:#fff4ed;border-radius:12px;padding:18px 20px">
            <div style="font-size:16px;font-weight:700;margin-bottom:8px">Wasn’t you?</div>
            <div style="font-size:14px;line-height:1.6;color:#6b6675">Reset your password immediately and contact <a href="mailto:hello@careerely.ai" style="color:#171717">hello@careerely.ai</a>.</div>
            <a href="${resetUrl}" style="display:inline-block;margin-top:14px;background:#171717;color:#fff;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700">Secure my account</a>
          </div>
        </div>
      </div>`,
  }
}

export async function sendPasswordChangeNotification(email: string): Promise<void> {
  const { error } = await new Resend(env.resendApiKey()).emails.send({
    from: 'Careerely <hello@careerely.ai>',
    to: email,
    ...passwordChangeMessage(),
  })
  if (error) throw new Error(`Password change notification failed: ${error.message}`)
}
