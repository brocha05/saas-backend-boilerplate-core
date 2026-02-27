export interface BaseTemplateContext {
  appName: string;
  appUrl: string;
  year?: number;
}

export function baseLayout(content: string, ctx: BaseTemplateContext): string {
  const year = ctx.year ?? new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${ctx.appName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo / App name -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <a href="${ctx.appUrl}" style="text-decoration:none;font-size:22px;font-weight:700;color:#111827;">${ctx.appName}</a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                © ${year} ${ctx.appName}. All rights reserved.<br />
                <a href="${ctx.appUrl}" style="color:#9ca3af;text-decoration:underline;">${ctx.appUrl}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

export function primaryButton(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;margin-top:8px;">${text}</a>`;
}

export function paragraph(text: string): string {
  return `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">${text}</p>`;
}

export function heading(text: string): string {
  return `<h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 20px;">${text}</h1>`;
}

export function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />`;
}

export function labelValue(label: string, value: string): string {
  return `<tr>
    <td style="color:#6b7280;font-size:13px;padding:4px 0;">${label}</td>
    <td style="color:#111827;font-size:13px;font-weight:600;padding:4px 0 4px 12px;">${value}</td>
  </tr>`;
}
