import { Body, Controller, Patch, Param } from '@nestjs/common';
import { z } from 'zod';
import { SpecArtifactsService } from './spec-artifacts.service';

const UpdateArtifactSchema = z.object({
  action: z.enum(['confirm', 'reject', 'edit']).optional(),
  status: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

@Controller('spec-artifacts')
export class SpecArtifactsController {
  constructor(private readonly artifacts: SpecArtifactsService) {}

  @Patch(':artifactId')
  async update(
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
  ): Promise<Record<string, unknown>> {
    const input = UpdateArtifactSchema.parse(body);
    return this.artifacts.updateArtifact(artifactId, input);
  }
}
