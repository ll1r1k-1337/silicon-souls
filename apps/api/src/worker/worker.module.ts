import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BackgroundJobsModule } from '../modules/background-jobs/background-jobs.module';
import { LlmModule } from '../modules/llm/llm.module';
import { ProjectsModule } from '../modules/projects/projects.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { SpecSessionsModule } from '../modules/spec-sessions/spec-sessions.module';
import { DatabaseModule } from '../shared/database/database.module';
import { EventStoreModule } from '../shared/events/event-store.module';
import { BackgroundWorkerService } from './background-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EventStoreModule,
    LlmModule,
    SettingsModule,
    BackgroundJobsModule,
    ProjectsModule,
    SpecSessionsModule,
  ],
  providers: [BackgroundWorkerService],
})
export class WorkerModule {}
