import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TwoFactorSetupDto,
  BackupCodesDto,
  TwoFactorStatusDto,
} from './dto/two-factor.dto';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const BACKUP_CODE_COUNT = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derives a fixed-length AES key from the config value (pad/truncate to 32 bytes). */
function toKeyBuffer(hexKey: string): Buffer | null {
  if (hexKey.length !== 64) return null;
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns "ivHex:authTagHex:ciphertextHex".
 */
function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext in "ivHex:authTagHex:ciphertextHex" format.
 */
function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, authTagHex, encHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * One-way hash for backup codes: SHA-256(userId + ":" + normalisedCode).
 * The userId acts as a per-user salt, making cross-user rainbow tables infeasible.
 */
function hashBackupCode(userId: string, normalisedCode: string): string {
  return createHash('sha256')
    .update(`${userId}:${normalisedCode}`)
    .digest('hex');
}

/** Normalise a backup code: strip dashes + uppercase. */
function normaliseCode(code: string): string {
  return code.replace(/-/g, '').toUpperCase();
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly encryptionKey: Buffer | null;
  private readonly issuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const hexKey = config.get<string>('mfa.encryptionKey') ?? '';
    this.encryptionKey = toKeyBuffer(hexKey);
    this.issuer = config.get<string>('mfa.issuer') ?? 'MySaaS';

    if (!this.encryptionKey) {
      this.logger.warn(
        'MFA_ENCRYPTION_KEY is not set or invalid — TOTP secrets stored ' +
          'unencrypted. Set a 64-char hex key in production.',
      );
    }
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  async getStatus(userId: string): Promise<TwoFactorStatusDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    return { enabled: user?.twoFactorEnabled ?? false };
  }

  // ─── Setup — step 1: generate secret ────────────────────────────────────────

  async generateSetup(userId: string): Promise<TwoFactorSetupDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!user) throw new BadRequestException('User not found');
    if (user.twoFactorEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    const secret = generateSecret(); // 160-bit base32 secret (default length 20)
    const otpauthUrl = generateURI({
      strategy: 'totp',
      issuer: this.issuer,
      label: user.email,
      secret,
    });
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Persist the pending secret (not yet enabled — user must confirm with a code)
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: this.encryptSecret(secret) },
    });

    return { secret, otpauthUrl, qrDataUrl };
  }

  // ─── Setup — step 2: verify code and enable ─────────────────────────────────

  async verifyAndEnable(userId: string, code: string): Promise<BackupCodesDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user?.twoFactorSecret) {
      throw new BadRequestException(
        '2FA setup not initiated — call POST /auth/2fa/setup first',
      );
    }
    if (user.twoFactorEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    const secret = this.decryptSecret(user.twoFactorSecret);
    if (!verifySync({ token: code, secret, strategy: 'totp' }).valid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Generate backup codes
    const { plain, hashes } = this.generateBackupCodes(userId);

    // Enable 2FA and store backup code hashes in one transaction
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      }),
      this.prisma.backupCode.deleteMany({ where: { userId } }), // clear any old ones
      this.prisma.backupCode.createMany({
        data: hashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);

    this.logger.log(`2FA enabled for user ${userId}`);
    return { backupCodes: plain };
  }

  // ─── Verify code (TOTP or backup) ───────────────────────────────────────────

  /**
   * Returns true if the code is a valid current TOTP token OR an unused backup code.
   * Backup codes are consumed (marked usedAt) on first successful use.
   */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user?.twoFactorEnabled || !user.twoFactorSecret) return false;

    // 1. Try TOTP (±1 window = ±30 s clock tolerance)
    const secret = this.decryptSecret(user.twoFactorSecret);
    if (verifySync({ token: code, secret, strategy: 'totp' }).valid)
      return true;

    // 2. Try backup code
    return this.consumeBackupCode(userId, code);
  }

  // ─── Disable ────────────────────────────────────────────────────────────────

  async disable(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user?.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const valid = await this.verifyCode(userId, code);
    if (!valid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      }),
      this.prisma.backupCode.deleteMany({ where: { userId } }),
    ]);

    this.logger.log(`2FA disabled for user ${userId}`);
  }

  // ─── Regenerate backup codes ─────────────────────────────────────────────────

  async regenerateBackupCodes(
    userId: string,
    code: string,
  ): Promise<BackupCodesDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user?.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const valid = await this.verifyCode(userId, code);
    if (!valid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    const { plain, hashes } = this.generateBackupCodes(userId);

    await this.prisma.$transaction([
      this.prisma.backupCode.deleteMany({ where: { userId } }),
      this.prisma.backupCode.createMany({
        data: hashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);

    return { backupCodes: plain };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private encryptSecret(secret: string): string {
    if (!this.encryptionKey) return secret;
    return encrypt(secret, this.encryptionKey);
  }

  private decryptSecret(stored: string): string {
    if (!this.encryptionKey) return stored;
    // Handle rows that were stored before encryption was configured
    if (!stored.includes(':')) return stored;
    return decrypt(stored, this.encryptionKey);
  }

  /**
   * Generates BACKUP_CODE_COUNT backup codes.
   * Returns plaintext codes (for display) and their hashes (for storage).
   */
  private generateBackupCodes(userId: string): {
    plain: string[];
    hashes: string[];
  } {
    const plain: string[] = [];
    const hashes: string[] = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      const raw = randomBytes(6).toString('hex').toUpperCase(); // 12 hex chars = 48 bits
      const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`; // "XXXX-XXXX-XXXX"
      plain.push(formatted);
      hashes.push(hashBackupCode(userId, normaliseCode(formatted)));
    }

    return { plain, hashes };
  }

  /** Finds and marks one matching unused backup code as used. Returns true on match. */
  private async consumeBackupCode(
    userId: string,
    inputCode: string,
  ): Promise<boolean> {
    const hash = hashBackupCode(userId, normaliseCode(inputCode));

    const record = await this.prisma.backupCode.findFirst({
      where: { userId, codeHash: hash, usedAt: null },
    });

    if (!record) return false;

    await this.prisma.backupCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return true;
  }
}
