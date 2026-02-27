import {
  baseLayout,
  BaseTemplateContext,
  heading,
  paragraph,
  primaryButton,
  divider,
  labelValue,
} from './base.template';

export interface InvoicePaidTemplateContext extends BaseTemplateContext {
  firstName: string;
  companyName: string;
  amountPaid: number; // in cents
  currency: string;
  periodEnd: Date;
  invoicePdfUrl?: string;
}

export function invoicePaidTemplate(ctx: InvoicePaidTemplateContext): {
  subject: string;
  html: string;
  text: string;
} {
  const amount = (ctx.amountPaid / 100).toFixed(2);
  const currency = ctx.currency.toUpperCase();
  const renewalDate = ctx.periodEnd.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Payment receipt — ${currency} ${amount}`;

  const detailsTable = `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;">
      ${labelValue('Amount Paid', `${currency} ${amount}`)}
      ${labelValue('Company', ctx.companyName)}
      ${labelValue('Next Renewal', renewalDate)}
    </table>
  `;

  const downloadButton = ctx.invoicePdfUrl
    ? `<br />${primaryButton('Download Invoice', ctx.invoicePdfUrl)}`
    : '';

  const content = `
    ${heading('Payment Received')}
    ${paragraph(`Hi ${ctx.firstName}, thank you for your payment!`)}
    ${detailsTable}
    ${paragraph(`Your subscription for <strong>${ctx.companyName}</strong> will automatically renew on <strong>${renewalDate}</strong>.`)}
    ${primaryButton('Manage Billing', `${ctx.appUrl}/settings/billing`)}
    ${downloadButton}
    ${divider()}
    ${paragraph(`Keep this email as your receipt. If you have any questions about your invoice, please contact support.`)}
  `;

  const text = `Payment received: ${currency} ${amount} for ${ctx.companyName}.\nNext renewal: ${renewalDate}.\n\nManage billing at: ${ctx.appUrl}/settings/billing`;

  return { subject, html: baseLayout(content, ctx), text };
}
