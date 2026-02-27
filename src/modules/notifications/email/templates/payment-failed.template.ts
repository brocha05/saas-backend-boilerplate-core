import {
  baseLayout,
  BaseTemplateContext,
  heading,
  paragraph,
  primaryButton,
  divider,
  labelValue,
} from './base.template';

export interface PaymentFailedTemplateContext extends BaseTemplateContext {
  firstName: string;
  companyName: string;
  amountDue: number; // in cents
  currency: string;
  nextRetryAt?: Date;
  updatePaymentUrl: string;
}

export function paymentFailedTemplate(ctx: PaymentFailedTemplateContext): {
  subject: string;
  html: string;
  text: string;
} {
  const amount = (ctx.amountDue / 100).toFixed(2);
  const currency = ctx.currency.toUpperCase();

  const retryText = ctx.nextRetryAt
    ? `We'll automatically retry on ${ctx.nextRetryAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : 'Please update your payment method to continue your subscription.';

  const subject = `Action required — Payment failed for ${ctx.companyName}`;

  const detailsTable = `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;">
      ${labelValue('Amount Due', `${currency} ${amount}`)}
      ${labelValue('Company', ctx.companyName)}
      ${ctx.nextRetryAt ? labelValue('Next Retry', ctx.nextRetryAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })) : ''}
    </table>
  `;

  const content = `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="color:#b91c1c;font-size:14px;font-weight:600;margin:0;">⚠️ Payment Failed</p>
    </div>
    ${heading("We couldn't process your payment")}
    ${paragraph(`Hi ${ctx.firstName},`)}
    ${paragraph(`Unfortunately, we were unable to charge your payment method for <strong>${ctx.companyName}</strong>'s subscription.`)}
    ${detailsTable}
    ${paragraph(retryText)}
    ${primaryButton('Update Payment Method', ctx.updatePaymentUrl)}
    ${divider()}
    ${paragraph(`To avoid interruption to your service, please update your payment information as soon as possible. Your subscription will remain active during the grace period.`)}
  `;

  const text = `Payment failed for ${ctx.companyName}. Amount due: ${currency} ${amount}.\n\nUpdate your payment method at:\n${ctx.updatePaymentUrl}`;

  return { subject, html: baseLayout(content, ctx), text };
}
