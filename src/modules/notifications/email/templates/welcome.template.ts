import {
  baseLayout,
  BaseTemplateContext,
  heading,
  paragraph,
  primaryButton,
  divider,
} from './base.template';

export interface WelcomeTemplateContext extends BaseTemplateContext {
  firstName: string;
  companyName: string;
}

export function welcomeTemplate(ctx: WelcomeTemplateContext): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Welcome to ${ctx.appName}, ${ctx.firstName}!`;

  const content = `
    ${heading(`Welcome, ${ctx.firstName}! 🎉`)}
    ${paragraph(`Your account for <strong>${ctx.companyName}</strong> has been created. You're all set to start using ${ctx.appName}.`)}
    ${paragraph('Here are a few things you can do to get started:')}
    <ul style="color:#374151;font-size:15px;line-height:2;padding-left:20px;margin:0 0 20px;">
      <li>Complete your company profile</li>
      <li>Invite team members</li>
      <li>Choose a subscription plan</li>
    </ul>
    ${primaryButton('Go to Dashboard', ctx.appUrl)}
    ${divider()}
    ${paragraph(`If you have any questions, reply to this email and we'll be happy to help.`)}
  `;

  const text = `Welcome to ${ctx.appName}, ${ctx.firstName}!\n\nYour account for ${ctx.companyName} has been created.\n\nVisit your dashboard at: ${ctx.appUrl}`;

  return { subject, html: baseLayout(content, ctx), text };
}
