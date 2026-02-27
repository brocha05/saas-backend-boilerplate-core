import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('s3.region') ?? 'us-east-1';
    const endpoint = this.config.get<string>('s3.endpoint');
    const forcePathStyle =
      this.config.get<boolean>('s3.forcePathStyle') ?? false;

    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId: this.config.get<string>('s3.accessKeyId') ?? '',
        secretAccessKey: this.config.get<string>('s3.secretAccessKey') ?? '',
      },
      ...(endpoint && { endpoint }),
      ...(forcePathStyle && { forcePathStyle }),
    });

    this.bucket = this.config.get<string>('s3.bucket') ?? '';
  }

  /**
   * Upload a file buffer to S3.
   */
  async upload(
    key: string,
    buffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ServerSideEncryption: 'AES256',
          ...(metadata && { Metadata: metadata }),
        }),
      );
    } catch (err) {
      this.logger.error(`S3 upload failed for key ${key}`, err);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  /**
   * Generate a short-lived presigned URL to download a file.
   * Default TTL: 15 minutes.
   */
  async getPresignedDownloadUrl(key: string, expiresIn = 900): Promise<string> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (err) {
      this.logger.error(`Failed to generate presigned URL for key ${key}`, err);
      throw new InternalServerErrorException('Could not generate download URL');
    }
  }

  /**
   * Generate a short-lived presigned URL so clients can upload directly to S3.
   * Default TTL: 1 hour.
   */
  async getPresignedUploadUrl(
    key: string,
    mimeType: string,
    expiresIn = 3600,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (err) {
      this.logger.error(
        `Failed to generate presigned upload URL for key ${key}`,
        err,
      );
      throw new InternalServerErrorException('Could not generate upload URL');
    }
  }

  /**
   * Delete a single object from S3.
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.error(`S3 delete failed for key ${key}`, err);
      // Non-fatal: log only — the record is already soft-deleted in the DB
    }
  }

  /**
   * Delete multiple objects in a single S3 batch request (max 1000 per call).
   */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    // S3 DeleteObjects supports up to 1000 objects per request
    const chunks = this.chunkArray(keys, 1000);

    for (const chunk of chunks) {
      try {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
      } catch (err) {
        this.logger.error(
          `S3 batch delete failed for ${chunk.length} keys`,
          err,
        );
      }
    }
  }

  /**
   * Returns true if the object exists in S3, false if it does not.
   * Used to validate presigned-upload confirmations before writing to DB.
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      if (err instanceof NotFound) return false;
      // Re-throw unexpected S3 errors
      this.logger.error(`HeadObject failed for key ${key}`, err);
      throw new InternalServerErrorException(
        'Could not verify file in storage',
      );
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  getBucket(): string {
    return this.bucket;
  }
}
