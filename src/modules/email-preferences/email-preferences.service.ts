import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailCategory, EmailCategoryType } from './email-category.constants';
import { EmailPreferenceDto, UpdateEmailPreferenceDto } from './dto';
import { EmailPreference } from '@prisma/client';

@Injectable()
export class EmailPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Core helpers ──────────────────────────────────────────────────────────

  /**
   * Returns the user's preferences, creating them with defaults if they don't
   * exist yet (lazy initialisation as a safety net alongside the event listener).
   */
  async findOrCreate(userId: string): Promise<EmailPreference> {
    return this.prisma.emailPreference.upsert({
      where: { userId },
      create: {
        userId,
        unsubscribeToken: randomBytes(32).toString('hex'),
      },
      update: {},
    });
  }

  /**
   * Returns true when an email in the given category should be sent to this user.
   * Transactional emails are never suppressed.
   */
  async canSend(userId: string, category: EmailCategoryType): Promise<boolean> {
    if (category === EmailCategory.TRANSACTIONAL) return true;

    const prefs = await this.findOrCreate(userId);

    switch (category) {
      case EmailCategory.BILLING:
        return prefs.billing;
      case EmailCategory.PRODUCT_UPDATES:
        return prefs.productUpdates;
      case EmailCategory.MARKETING:
        return prefs.marketing;
      default:
        return true;
    }
  }

  // ─── Authenticated API ─────────────────────────────────────────────────────

  async getForUser(userId: string): Promise<EmailPreferenceDto> {
    const prefs = await this.findOrCreate(userId);
    return this.toDto(prefs);
  }

  async updateForUser(
    userId: string,
    dto: UpdateEmailPreferenceDto,
  ): Promise<EmailPreferenceDto> {
    await this.findOrCreate(userId); // ensure record exists
    const updated = await this.prisma.emailPreference.update({
      where: { userId },
      data: {
        ...(dto.billing !== undefined && { billing: dto.billing }),
        ...(dto.productUpdates !== undefined && {
          productUpdates: dto.productUpdates,
        }),
        ...(dto.marketing !== undefined && { marketing: dto.marketing }),
      },
    });
    return this.toDto(updated);
  }

  // ─── Token-based (unauthenticated) API ────────────────────────────────────

  /** Looks up preferences by the opaque unsubscribe token embedded in emails. */
  async findByToken(token: string): Promise<EmailPreferenceDto> {
    const prefs = await this.prisma.emailPreference.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!prefs) throw new NotFoundException('Invalid unsubscribe token');
    return this.toDto(prefs);
  }

  /** Updates preferences identified by an unsubscribe token (no auth needed). */
  async updateByToken(
    token: string,
    dto: UpdateEmailPreferenceDto,
  ): Promise<EmailPreferenceDto> {
    const existing = await this.prisma.emailPreference.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!existing) throw new NotFoundException('Invalid unsubscribe token');

    const updated = await this.prisma.emailPreference.update({
      where: { unsubscribeToken: token },
      data: {
        ...(dto.billing !== undefined && { billing: dto.billing }),
        ...(dto.productUpdates !== undefined && {
          productUpdates: dto.productUpdates,
        }),
        ...(dto.marketing !== undefined && { marketing: dto.marketing }),
      },
    });
    return this.toDto(updated);
  }

  /**
   * One-click unsubscribe — sets all optional categories to false.
   * Triggered from the unsubscribe link in email footers (no login required).
   * Complies with RFC 8058 List-Unsubscribe-Post and CAN-SPAM one-click requirements.
   */
  async unsubscribeAll(token: string): Promise<EmailPreferenceDto> {
    const existing = await this.prisma.emailPreference.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!existing) throw new NotFoundException('Invalid unsubscribe token');

    const updated = await this.prisma.emailPreference.update({
      where: { unsubscribeToken: token },
      data: { billing: false, productUpdates: false, marketing: false },
    });
    return this.toDto(updated);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private toDto(prefs: EmailPreference): EmailPreferenceDto {
    return {
      billing: prefs.billing,
      productUpdates: prefs.productUpdates,
      marketing: prefs.marketing,
      updatedAt: prefs.updatedAt,
    };
  }
}
