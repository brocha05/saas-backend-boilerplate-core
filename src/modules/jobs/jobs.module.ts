import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { TokenCleanupTask } from './tasks/token-cleanup.task';
import { FilePurgeTask } from './tasks/file-purge.task';
import { DataRetentionTask } from './tasks/data-retention.task';

@Module({
  imports: [
    FilesModule, // provides S3Service for FilePurgeTask
  ],
  providers: [TokenCleanupTask, FilePurgeTask, DataRetentionTask],
})
export class JobsModule {}
