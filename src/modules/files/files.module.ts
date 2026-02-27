import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../../prisma/prisma.module';
import { S3Service } from './s3.service';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [FilesController],
  providers: [S3Service, FilesService],
  // Export so other modules (e.g. UsersModule) can inject FilesService
  exports: [FilesService, S3Service],
})
export class FilesModule {}
