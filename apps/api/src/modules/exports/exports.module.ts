import { Module } from '@nestjs/common';
import { SpecSessionsModule } from '../spec-sessions/spec-sessions.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [SpecSessionsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
