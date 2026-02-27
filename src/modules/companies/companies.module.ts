import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { FilesModule } from '../files/files.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [FilesModule, SubscriptionsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
