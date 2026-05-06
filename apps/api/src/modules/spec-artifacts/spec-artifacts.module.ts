import { Module } from '@nestjs/common';
import { SpecArtifactsController } from './spec-artifacts.controller';
import { SpecArtifactsService } from './spec-artifacts.service';

@Module({
  controllers: [SpecArtifactsController],
  providers: [SpecArtifactsService],
})
export class SpecArtifactsModule {}
