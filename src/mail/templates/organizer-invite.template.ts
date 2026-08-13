export type OrganizerInviteTemplateParams = {
  firstName: string;
  inviteUrl: string;
};

const BRAND_BLUE = '#1d4ed8';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayName(firstName: string): string {
  const trimmed = firstName.trim();
  if (!trimmed) return 'there';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function organizerInviteSubject(): string {
  return 'Your Sportech organiser invite';
}

export function organizerInviteText(params: OrganizerInviteTemplateParams): string {
  const name = displayName(params.firstName);

  return [
    `Hi ${name},`,
    '',
    'An admin has added you as an event organiser on Sportech.',
    'Use the link below to set up your account and get started:',
    '',
    params.inviteUrl,
    '',
    'The link is valid for 48 hours.',
    '',
    "If you weren't expecting this email, you can safely ignore it.",
    '',
    '— The Sportech team',
  ].join('\n');
}

export function organizerInviteHtml(params: OrganizerInviteTemplateParams): string {
  const name = escapeHtml(displayName(params.firstName));
  const inviteUrl = params.inviteUrl;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sportech organiser invite</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
          <tr>
            <td style="height:4px;background-color:${BRAND_BLUE};border-radius:8px 8px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 28px;font-size:13px;font-weight:600;letter-spacing:0.04em;color:${BRAND_BLUE};text-transform:uppercase;">Sportech</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.35;color:#111827;">You're invited to organise events</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
                Hi ${name},
                <br /><br />
                An admin has added you as an event organiser on Sportech. Set up your account to start creating and managing events.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background-color:${BRAND_BLUE};">
                    <a href="${inviteUrl}" style="display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;">
                      Set up your account
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#9ca3af;">
                This link is valid for 48 hours. If you weren't expecting this, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">
                Sportech &middot; sportechpro.com
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
