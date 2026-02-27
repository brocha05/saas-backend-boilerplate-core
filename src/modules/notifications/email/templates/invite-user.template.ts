import {
  baseLayout,
  BaseTemplateContext,
  heading,
  paragraph,
  primaryButton,
  divider,
} from './base.template';

export interface InviteUserTemplateContext extends BaseTemplateContext {
  inviteeName?: string;
  inviterName: string;
  companyName: string;
  acceptUrl: string;
}

export function inviteUserTemplate(ctx: InviteUserTemplateContext): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${ctx.inviterName} invited you to join ${ctx.companyName}`;
  const greeting = ctx.inviteeName ? `Hi ${ctx.inviteeName},` : 'Hi there,';

  const content = `
    ${heading(`You're invited to ${ctx.companyName}!`)}
    ${paragraph(greeting)}
    ${paragraph(`<strong>${ctx.inviterName}</strong> has invited you to join <strong>${ctx.companyName}</strong> on ${ctx.appName}.`)}
    ${primaryButton('Accept Invitation', ctx.acceptUrl)}
    ${divider()}
    ${paragraph(`If you weren't expecting this invitation, you can safely ignore this email.`)}
    <p style="color:#9ca3af;font-size:12px;margin:8px 0 0;">If the button doesn't work, copy and paste this URL:<br /><a href="${ctx.acceptUrl}" style="color:#4f46e5;word-break:break-all;">${ctx.acceptUrl}</a></p>
  `;

  const text = `${ctx.inviterName} invited you to join ${ctx.companyName} on ${ctx.appName}.\n\nAccept your invitation at:\n${ctx.acceptUrl}`;

  return { subject, html: baseLayout(content, ctx), text };
}
