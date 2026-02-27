import {
  baseLayout,
  BaseTemplateContext,
  heading,
  paragraph,
  primaryButton,
  divider,
} from './base.template';

export interface EmailVerificationTemplateContext extends BaseTemplateContext {
  firstName: string;
  verifyUrl: string;
  expiresInHours?: number;
}

export function emailVerificationTemplate(
  ctx: EmailVerificationTemplateContext,
): { subject: string; html: string; text: string } {
  const subject = `Verify your ${ctx.appName} email address`;
  const expiresIn = ctx.expiresInHours ?? 24;

  const content = `
    ${heading('Verify your email address')}
    ${paragraph(`Hi ${ctx.firstName},`)}
    ${paragraph(`Thanks for signing up for ${ctx.appName}. Please verify your email address by clicking the button below.`)}
    ${primaryButton('Verify Email', ctx.verifyUrl)}
    ${divider()}
    ${paragraph(`This link will expire in <strong>${expiresIn} hours</strong>. If you didn't create an account, you can safely ignore this email.`)}
    <p style="color:#9ca3af;font-size:12px;margin:8px 0 0;">If the button doesn't work, copy and paste this URL:<br /><a href="${ctx.verifyUrl}" style="color:#4f46e5;word-break:break-all;">${ctx.verifyUrl}</a></p>
  `;

  const text = `Hi ${ctx.firstName},\n\nVerify your ${ctx.appName} email address by visiting:\n${ctx.verifyUrl}\n\nThis link expires in ${expiresIn} hours.`;

  return { subject, html: baseLayout(content, ctx), text };
}
