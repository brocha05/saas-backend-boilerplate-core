import {
  baseLayout,
  BaseTemplateContext,
  heading,
  paragraph,
  primaryButton,
  divider,
} from './base.template';

export interface SubscriptionCanceledTemplateContext
  extends BaseTemplateContext {
  firstName: string;
  companyName: string;
  planName: string;
  cancelAt: Date;
  reactivateUrl: string;
}

export function subscriptionCanceledTemplate(
  ctx: SubscriptionCanceledTemplateContext,
): { subject: string; html: string; text: string } {
  const cancelDate = ctx.cancelAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Your ${ctx.appName} subscription has been canceled`;

  const content = `
    ${heading('Subscription Canceled')}
    ${paragraph(`Hi ${ctx.firstName},`)}
    ${paragraph(`We're sorry to see you go! Your <strong>${ctx.planName}</strong> subscription for <strong>${ctx.companyName}</strong> has been canceled.`)}
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#374151;font-size:14px;margin:0;">You'll continue to have access to all features until <strong>${cancelDate}</strong>. After that date, your account will be downgraded.</p>
    </div>
    ${paragraph(`Changed your mind? You can reactivate your subscription at any time before it expires.`)}
    ${primaryButton('Reactivate Subscription', ctx.reactivateUrl)}
    ${divider()}
    ${paragraph(`If you canceled by mistake or have any questions, please reply to this email — we're happy to help.`)}
  `;

  const text = `Hi ${ctx.firstName},\n\nYour ${ctx.planName} subscription for ${ctx.companyName} has been canceled. You'll have access until ${cancelDate}.\n\nReactivate at: ${ctx.reactivateUrl}`;

  return { subject, html: baseLayout(content, ctx), text };
}
