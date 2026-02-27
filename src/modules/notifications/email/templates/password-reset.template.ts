import {
  baseLayout,
  BaseTemplateContext,
  heading,
  paragraph,
  primaryButton,
  divider,
} from './base.template';

export interface PasswordResetTemplateContext extends BaseTemplateContext {
  firstName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export function passwordResetTemplate(ctx: PasswordResetTemplateContext): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Reset your ${ctx.appName} password`;
  const expiresIn = ctx.expiresInMinutes ?? 60;

  const content = `
    ${heading('Password Reset Request')}
    ${paragraph(`Hi ${ctx.firstName},`)}
    ${paragraph(`We received a request to reset the password for your ${ctx.appName} account. Click the button below to choose a new password.`)}
    ${primaryButton('Reset Password', ctx.resetUrl)}
    ${divider()}
    ${paragraph(`This link will expire in <strong>${expiresIn} minutes</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't change.`)}
    <p style="color:#9ca3af;font-size:12px;margin:8px 0 0;">If the button doesn't work, copy and paste this URL:<br /><a href="${ctx.resetUrl}" style="color:#4f46e5;word-break:break-all;">${ctx.resetUrl}</a></p>
  `;

  const text = `Hi ${ctx.firstName},\n\nReset your password by visiting:\n${ctx.resetUrl}\n\nThis link expires in ${expiresIn} minutes.`;

  return { subject, html: baseLayout(content, ctx), text };
}

// ─── Password reset confirmation ─────────────────────────────────────────────

export interface PasswordResetCompletedTemplateContext extends BaseTemplateContext {
  firstName: string;
}

export function passwordResetCompletedTemplate(
  ctx: PasswordResetCompletedTemplateContext,
): { subject: string; html: string; text: string } {
  const subject = `Your ${ctx.appName} password was changed`;

  const content = `
    ${heading('Password Changed Successfully')}
    ${paragraph(`Hi ${ctx.firstName},`)}
    ${paragraph(`Your password has been updated. You can now log in with your new password.`)}
    ${primaryButton('Log In', `${ctx.appUrl}/login`)}
    ${divider()}
    ${paragraph(`If you didn't make this change, please contact support immediately.`)}
  `;

  const text = `Hi ${ctx.firstName},\n\nYour password has been changed. Log in at: ${ctx.appUrl}/login`;

  return { subject, html: baseLayout(content, ctx), text };
}
