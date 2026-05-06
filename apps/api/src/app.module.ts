import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BackgroundJobsModule } from './modules/background-jobs/background-jobs.module';
import { ExportsModule } from './modules/exports/exports.module';
import { LlmModule } from './modules/llm/llm.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SpecArtifactsModule } from './modules/spec-artifacts/spec-artifacts.module';
import { SpecSessionsModule } from './modules/spec-sessions/spec-sessions.module';
import { DatabaseModule } from './shared/database/database.module';
import { EventStoreModule } from './shared/events/event-store.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EventStoreModule,
    LlmModule,
    BackgroundJobsModule,
    SettingsModule,
    ProjectsModule,
    SpecSessionsModule,
    SpecArtifactsModule,
    ExportsModule,
  ],
})
export class AppModule {}
