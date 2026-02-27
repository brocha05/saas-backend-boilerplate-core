import { Module } from '@nestjs/common';
import { EmailPreferencesService } from './email-preferences.service';
import { EmailPreferencesController } from './email-preferences.controller';
import { EmailPreferencesListener } from './email-preferences.listener';

@Module({
  controllers: [EmailPreferencesController],
  providers: [EmailPreferencesService, EmailPreferencesListener],
  exports: [EmailPreferencesService],
})
export class EmailPreferencesModule {}
