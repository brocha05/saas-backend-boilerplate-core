import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TokenCleanupTask {
  private readonly logger = new Logger(TokenCleanupTask.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs daily at 02:00.
   * Removes expired and revoked auth tokens to keep those tables lean.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTokens(): Promise<void> {
    const start = Date.now();
    this.logger.log('Token cleanup started');

    try {
      const now = new Date();

      const [refreshResult, resetResult] = await Promise.all([
        // Expired OR explicitly revoked refresh tokens
        this.prisma.refreshToken.deleteMany({
          where: {
            OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
          },
        }),
        // Expired OR already-used password reset tokens
        this.prisma.passwordResetToken.deleteMany({
          where: {
            OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
          },
        }),
      ]);

      this.logger.log(
        `Token cleanup done in ${Date.now() - start}ms — ` +
          `${refreshResult.count} refresh, ${resetResult.count} reset tokens removed`,
      );
    } catch (err) {
      this.logger.error('Token cleanup failed', err);
    }
  }
}
