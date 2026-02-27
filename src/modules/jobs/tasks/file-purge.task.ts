import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { S3Service } from '../../files/s3.service';

/** Files soft-deleted more than this many days ago are permanently removed from S3 + DB. */
const FILE_RETENTION_DAYS = 7;

@Injectable()
export class FilePurgeTask {
  private readonly logger = new Logger(FilePurgeTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Runs daily at 04:00.
   * Hard-deletes File records that were soft-deleted more than FILE_RETENTION_DAYS days ago,
   * and removes the corresponding objects from S3.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeDeletedFiles(): Promise<void> {
    const start = Date.now();
    const cutoff = new Date(
      Date.now() - FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    this.logger.log(
      `File purge started — target: deleted before ${cutoff.toISOString()}`,
    );

    try {
      const files = await this.prisma.file.findMany({
        where: { deletedAt: { not: null, lt: cutoff } },
        select: { id: true, key: true },
      });

      if (files.length === 0) {
        this.logger.log('File purge: nothing to remove');
        return;
      }

      // Delete from S3 first — if it fails we keep the DB record and retry next run
      await this.s3.deleteMany(files.map((f) => f.key));

      await this.prisma.file.deleteMany({
        where: { id: { in: files.map((f) => f.id) } },
      });

      this.logger.log(
        `File purge done in ${Date.now() - start}ms — ` +
          `${files.length} files permanently removed`,
      );
    } catch (err) {
      this.logger.error('File purge failed', err);
    }
  }
}
