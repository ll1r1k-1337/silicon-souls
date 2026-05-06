import { Module } from '@nestjs/common';
import { BackgroundJobsModule } from '../background-jobs/background-jobs.module';
import { ProjectsModule } from '../projects/projects.module';
import { SpecSessionsController } from './spec-sessions.controller';
import { SpecSessionsService } from './spec-sessions.service';

@Module({
  imports: [BackgroundJobsModule, ProjectsModule],
  controllers: [SpecSessionsController],
  providers: [SpecSessionsService],
  exports: [SpecSessionsService],
})
export class SpecSessionsModule {}
