import {
  baseLayout,
  BaseTemplateContext,
  heading,
  paragraph,
  primaryButton,
  divider,
} from './base.template';

export interface SubscriptionActivatedTemplateContext extends BaseTemplateContext {
  firstName: string;
  companyName: string;
  planName: string;
}

export function subscriptionActivatedTemplate(
  ctx: SubscriptionActivatedTemplateContext,
): { subject: string; html: string; text: string } {
  const subject = `Your ${ctx.appName} subscription is active`;

  const content = `
    ${heading('Subscription Activated!')}
    ${paragraph(`Hi ${ctx.firstName},`)}
    ${paragraph(`Great news! <strong>${ctx.companyName}</strong>'s subscription to the <strong>${ctx.planName}</strong> plan is now active. You have full access to all features included in your plan.`)}
    ${primaryButton('Go to Dashboard', ctx.appUrl)}
    ${divider()}
    ${paragraph(`Need to manage your billing? Visit the billing portal anytime from your account settings.`)}
  `;

  const text = `Hi ${ctx.firstName},\n\nYour ${ctx.planName} subscription for ${ctx.companyName} is now active.\n\nVisit ${ctx.appUrl} to get started.`;

  return { subject, html: baseLayout(content, ctx), text };
}
