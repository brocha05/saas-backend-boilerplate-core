import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import type { File } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from './s3.service';
import { FileResponseDto } from './dto/file-response.dto';
import type { UploadFileDto } from './dto/upload-file.dto';
import type { ListFilesDto } from './dto/list-files.dto';
import type { MulterFile } from './interfaces/multer-file.interface';

export type { MulterFile };

export interface PaginatedFiles {
  data: FileResponseDto[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

// Allowed MIME types — extend as needed
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  // Spreadsheets
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  // Word documents
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  // Plain text
  'text/plain',
]);

// File size limit per MIME category (bytes)
const MAX_FILE_SIZE_IMAGE = 5 * 1024 * 1024; // 5 MB
const MAX_FILE_SIZE_DEFAULT = 20 * 1024 * 1024; // 20 MB

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_IMAGE, MAX_FILE_SIZE_DEFAULT };

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
  ) {}

  // ─── Upload (server-side) ──────────────────────────────────────────────────

  async upload(
    companyId: string,
    uploadedById: string,
    file: MulterFile,
    dto: UploadFileDto,
  ): Promise<FileResponseDto> {
    const ext = extname(file.originalname).toLowerCase();
    const folder = dto.resourceType ?? 'general';
    const key = `${companyId}/${folder}/${randomUUID()}${ext}`;

    await this.s3.upload(key, file.buffer, file.mimetype, {
      originalName: file.originalname,
      uploadedBy: uploadedById,
    });

    const saved = await this.prisma.file.create({
      data: {
        companyId,
        uploadedById,
        key,
        bucket: this.s3.getBucket(),
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        resourceType: dto.resourceType ?? null,
        resourceId: dto.resourceId ?? null,
      },
    });

    this.logger.log(
      `File uploaded: id=${saved.id} key=${key} by user=${uploadedById}`,
    );

    return FileResponseDto.fromEntity(saved);
  }

  // ─── Presigned upload (client → S3 direct) ────────────────────────────────

  /**
   * Returns a presigned S3 URL so the client can PUT the file directly to S3.
   * After the upload, the client must call confirmPresignedUpload() to register
   * the file metadata in the database.
   */
  async requestPresignedUpload(
    companyId: string,
    mimeType: string,
    originalName: string,
    resourceType?: string,
  ): Promise<PresignedUploadResponse> {
    const ext = extname(originalName).toLowerCase();
    const folder = resourceType ?? 'general';
    const key = `${companyId}/${folder}/${randomUUID()}${ext}`;
    const expiresIn = 3600; // 1 hour

    const uploadUrl = await this.s3.getPresignedUploadUrl(
      key,
      mimeType,
      expiresIn,
    );

    return { uploadUrl, key, expiresIn };
  }

  /**
   * Confirms an upload that was done directly by the client to S3 and saves
   * the file metadata to the database.
   */
  async confirmPresignedUpload(
    companyId: string,
    uploadedById: string,
    key: string,
    originalName: string,
    mimeType: string,
    size: number,
    dto: UploadFileDto,
  ): Promise<FileResponseDto> {
    // Reject keys that don't belong to this company (cross-tenant abuse prevention)
    if (!key.startsWith(`${companyId}/`)) {
      throw new BadRequestException('Invalid file key');
    }

    // Verify the object was actually uploaded before registering it in the DB
    const exists = await this.s3.fileExists(key);
    if (!exists) {
      throw new BadRequestException(
        'File not found in storage. Upload the file before confirming.',
      );
    }

    const saved = await this.prisma.file.create({
      data: {
        companyId,
        uploadedById,
        key,
        bucket: this.s3.getBucket(),
        originalName,
        mimeType,
        size,
        resourceType: dto.resourceType ?? null,
        resourceId: dto.resourceId ?? null,
      },
    });

    this.logger.log(
      `File confirmed: id=${saved.id} key=${key} by user=${uploadedById}`,
    );

    return FileResponseDto.fromEntity(saved);
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async findAll(
    companyId: string,
    query: ListFilesDto,
  ): Promise<PaginatedFiles> {
    const { page = 1, limit = 20, skip, resourceType, resourceId } = query;

    const where = {
      companyId,
      deletedAt: null,
      ...(resourceType && { resourceType }),
      ...(resourceId && { resourceId }),
    };

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      data: files.map(FileResponseDto.fromEntity),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, companyId: string): Promise<FileResponseDto> {
    const file = await this.findOrThrow(id, companyId);
    return FileResponseDto.fromEntity(file);
  }

  /**
   * Returns a short-lived presigned URL to download the file directly from S3.
   * Default TTL: 15 minutes.
   */
  async getDownloadUrl(
    id: string,
    companyId: string,
    expiresIn = 900,
  ): Promise<{ url: string; expiresIn: number }> {
    const file = await this.findOrThrow(id, companyId);
    const url = await this.s3.getPresignedDownloadUrl(file.key, expiresIn);
    return { url, expiresIn };
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  /**
   * Soft-deletes the DB record and asynchronously removes the object from S3.
   */
  async remove(id: string, companyId: string): Promise<void> {
    const file = await this.findOrThrow(id, companyId);

    await this.prisma.file.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Fire-and-forget: S3 deletion is best-effort; a cleanup job can be added later
    this.s3
      .delete(file.key)
      .catch((err) =>
        this.logger.error(
          `Background S3 delete failed for key ${file.key}`,
          err,
        ),
      );
  }

  /**
   * Soft-deletes all files associated with a given resource and removes them from S3.
   */
  async removeByResource(
    resourceType: string,
    resourceId: string,
    companyId: string,
  ): Promise<void> {
    const files = await this.prisma.file.findMany({
      where: { resourceType, resourceId, companyId, deletedAt: null },
    });

    if (files.length === 0) return;

    await this.prisma.file.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { deletedAt: new Date() },
    });

    await this.s3.deleteMany(files.map((f) => f.key));
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async findOrThrow(id: string, companyId: string): Promise<File> {
    const file = await this.prisma.file.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!file) throw new NotFoundException(`File ${id} not found`);

    return file;
  }
}
