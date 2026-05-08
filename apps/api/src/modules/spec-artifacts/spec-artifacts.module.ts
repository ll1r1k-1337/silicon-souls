import { Module } from '@nestjs/common';
import { SpecSessionsModule } from '../spec-sessions/spec-sessions.module';
import { SpecArtifactsController } from './spec-artifacts.controller';
import { SpecArtifactsService } from './spec-artifacts.service';

@Module({
  imports: [SpecSessionsModule],
  controllers: [SpecArtifactsController],
  providers: [SpecArtifactsService],
})
export class SpecArtifactsModule {}
