import { registerAs } from '@nestjs/config';

/**
 * MFA / 2FA configuration.
 *
 * Required env vars in production:
 *   MFA_ENCRYPTION_KEY — 64 hex chars (32 bytes). Encrypts TOTP secrets at rest.
 *                         Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   MFA_ISSUER         — Label shown in authenticator apps (defaults to APP_NAME).
 */
export default registerAs('mfa', () => ({
  encryptionKey: process.env.MFA_ENCRYPTION_KEY ?? '',
  issuer: process.env.MFA_ISSUER ?? process.env.APP_NAME ?? 'MySaaS',
}));
