import { IsString, Length } from 'class-validator';

/** Body for any endpoint that requires a TOTP or backup code. */
export class TwoFactorCodeDto {
  @IsString()
  @Length(6, 20) // TOTP = 6 digits; backup codes = "XXXX-XXXX-XXXX" = 14 chars
  code: string;
}

/** Returned when login requires a 2FA challenge. */
export class MfaRequiredDto {
  readonly mfaRequired = true;
  /** Short-lived JWT (5 min) used exclusively as the Bearer token for POST /auth/2fa/challenge. */
  mfaToken: string;
}

/** Returned by POST /auth/2fa/setup — before the user confirms the code. */
export class TwoFactorSetupDto {
  /** Base32 secret for manual entry into an authenticator app. */
  secret: string;
  /** otpauth:// URI — can be used to generate a QR code on the client side. */
  otpauthUrl: string;
  /** PNG QR code as a data: URL — ready to drop into an <img> tag. */
  qrDataUrl: string;
}

/** Returned ONCE on successful 2FA enrollment. Store and show these codes to the user. */
export class BackupCodesDto {
  /** 10 single-use recovery codes in XXXX-XXXX-XXXX format. Shown only once. */
  backupCodes: string[];
}

export class TwoFactorStatusDto {
  enabled: boolean;
}
