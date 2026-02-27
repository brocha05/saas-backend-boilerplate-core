import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

import {
  FilesService,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_IMAGE,
  MAX_FILE_SIZE_DEFAULT,
} from './files.service';
import type { MulterFile } from './interfaces/multer-file.interface';
import { FileResponseDto, ListFilesDto, UploadFileDto } from './dto';

@ApiTags('Files')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ─── Server-side Upload ──────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_DEFAULT },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a file (server-side, max 20 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        resourceType: { type: 'string', example: 'invoice' },
        resourceId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({ status: 201, type: FileResponseDto })
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: MulterFile,
    @Body() dto: UploadFileDto,
  ): Promise<FileResponseDto> {
    if (!file) throw new BadRequestException('No file provided');

    // Enforce tighter size limit for images
    if (file.mimetype.startsWith('image/') && file.size > MAX_FILE_SIZE_IMAGE) {
      throw new BadRequestException('Image files must not exceed 5 MB');
    }

    return this.filesService.upload(user.companyId, user.sub, file, dto);
  }

  // ─── Presigned Upload (client → S3) ─────────────────────────────────────

  @Post('presigned-upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a presigned S3 URL for direct client-to-S3 upload',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mimeType', 'originalName'],
      properties: {
        mimeType: { type: 'string', example: 'application/pdf' },
        originalName: { type: 'string', example: 'contract.pdf' },
        resourceType: { type: 'string', example: 'invoice' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'PUT the file to uploadUrl, then call POST /files/confirm',
    schema: {
      type: 'object',
      properties: {
        uploadUrl: { type: 'string' },
        key: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  requestPresignedUpload(
    @CurrentUser() user: JwtPayload,
    @Body('mimeType') mimeType: string,
    @Body('originalName') originalName: string,
    @Body('resourceType') resourceType?: string,
  ) {
    if (!mimeType || !originalName) {
      throw new BadRequestException('mimeType and originalName are required');
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Unsupported MIME type: ${mimeType}`);
    }
    return this.filesService.requestPresignedUpload(
      user.companyId,
      mimeType,
      originalName,
      resourceType,
    );
  }

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Confirm a direct S3 upload and register the file in the database',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['key', 'originalName', 'mimeType', 'size'],
      properties: {
        key: { type: 'string' },
        originalName: { type: 'string' },
        mimeType: { type: 'string' },
        size: { type: 'number' },
        resourceType: { type: 'string' },
        resourceId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({ status: 201, type: FileResponseDto })
  confirmPresignedUpload(
    @CurrentUser() user: JwtPayload,
    @Body('key') key: string,
    @Body('originalName') originalName: string,
    @Body('mimeType') mimeType: string,
    @Body('size', ParseIntPipe) size: number,
    @Body() dto: UploadFileDto,
  ): Promise<FileResponseDto> {
    if (!key || !originalName || !mimeType) {
      throw new BadRequestException(
        'key, originalName, and mimeType are required',
      );
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Unsupported MIME type: ${mimeType}`);
    }
    // Ensure the key belongs to this company (basic ownership check)
    if (!key.startsWith(`${user.companyId}/`)) {
      throw new BadRequestException('Invalid file key');
    }
    return this.filesService.confirmPresignedUpload(
      user.companyId,
      user.sub,
      key,
      originalName,
      mimeType,
      size,
      dto,
    );
  }

  // ─── List ────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List files for the current company' })
  @ApiQuery({ name: 'resourceType', required: false, example: 'invoice' })
  @ApiQuery({
    name: 'resourceId',
    required: false,
    type: String,
    format: 'uuid',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListFilesDto) {
    return this.filesService.findAll(user.companyId, query);
  }

  // ─── Get metadata ────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get file metadata by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, type: FileResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<FileResponseDto> {
    return this.filesService.findOne(id, user.companyId);
  }

  // ─── Presigned Download URL ──────────────────────────────────────────────

  @Get(':id/download')
  @ApiOperation({
    summary:
      'Get a short-lived presigned URL to download the file directly from S3',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiQuery({
    name: 'expiresIn',
    required: false,
    type: Number,
    description: 'URL TTL in seconds (default: 900 = 15 min)',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Query('expiresIn', new DefaultValuePipe(900), ParseIntPipe)
    expiresIn: number,
  ) {
    return this.filesService.getDownloadUrl(id, user.companyId, expiresIn);
  }

  // ─── Delete ──────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a file and remove it from S3' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204 })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.filesService.remove(id, user.companyId);
  }
}
