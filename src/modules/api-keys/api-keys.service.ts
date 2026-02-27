import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyResponseDto } from './dto/api-key-response.dto';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';
import type { ApiKeyContext } from '../../common/interfaces';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new API key for the given company.
   * The raw key is included in the response exactly once — it cannot be retrieved again.
   */
  async create(
    companyId: string,
    createdById: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    // "sk_" prefix + 32 random bytes as hex = 67-char key
    const rawKey = `sk_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    // Display prefix: "sk_" + first 9 hex chars → 12 chars total
    const keyPrefix = rawKey.slice(0, 12);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        companyId,
        createdById,
        name: dto.name,
        keyHash,
        keyPrefix,
        scopes: dto.scopes ?? [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    this.logger.log(`API key created: id=${apiKey.id} company=${companyId}`);

    // rawKey is included only here, never stored or returned again
    return ApiKeyResponseDto.fromEntity(apiKey, rawKey);
  }

  /**
   * Returns all API keys for the company (raw key is never included).
   */
  async findAll(companyId: string): Promise<ApiKeyResponseDto[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => ApiKeyResponseDto.fromEntity(k));
  }

  /**
   * Revokes an API key by setting revokedAt. Idempotent — already-revoked
   * keys are treated as not found to prevent information leakage.
   */
  async revoke(id: string, companyId: string): Promise<void> {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, companyId, revokedAt: null },
    });
    if (!existing) throw new NotFoundException('API key not found');

    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`API key revoked: id=${id} company=${companyId}`);
  }

  /**
   * Validates a raw API key string and returns its context.
   * Returns null if the key is unknown, revoked, or expired.
   * Updates lastUsedAt asynchronously so it does not add latency to requests.
   */
  async validateKey(rawKey: string): Promise<ApiKeyContext | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash } });

    if (!apiKey || apiKey.revokedAt) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    // Fire-and-forget — do not await; request latency must not be affected
    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) =>
        this.logger.warn(`lastUsedAt update failed for key ${apiKey.id}`, err),
      );

    return {
      apiKeyId: apiKey.id,
      companyId: apiKey.companyId,
      scopes: apiKey.scopes,
    };
  }
}
