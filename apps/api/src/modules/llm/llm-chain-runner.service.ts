import { Injectable } from '@nestjs/common';
import { LlmOutputRepairService } from './llm-output-repair.service';
import { LlmProviderResolver } from './llm-provider.resolver';
import { LlmTracingService } from './llm-tracing.service';
import type { RunStructuredParams } from './llm.interfaces';

@Injectable()
export class LlmChainRunner {
  constructor(
    private readonly providerResolver: LlmProviderResolver,
    private readonly repairService: LlmOutputRepairService,
    private readonly tracingService: LlmTracingService,
  ) {}

  async runStructured<Input, Output>(
    params: RunStructuredParams<Input, Output> & { promptVersion: string },
  ): Promise<Output> {
    const started = Date.now();
    const provider = await this.providerResolver.resolve();

    try {
      const output = await provider.invokeStructured(params);
      const parsed = params.outputSchema.parse(output);
      await this.tracingService.record({
        context: params.context,
        provider,
        promptVersion: params.promptVersion,
        status: 'completed',
        durationMs: Date.now() - started,
      });
      return parsed;
    } catch (error) {
      try {
        const repaired = await this.repairService.repairStructuredOutput(
          provider,
          params,
          error,
        );
        const parsed = params.outputSchema.parse(repaired);
        await this.tracingService.record({
          context: params.context,
          provider,
          promptVersion: params.promptVersion,
          status: 'completed',
          durationMs: Date.now() - started,
          metadata: { repaired: true },
        });
        return parsed;
      } catch (repairError) {
        await this.tracingService.record({
          context: params.context,
          provider,
          promptVersion: params.promptVersion,
          status: 'failed',
          durationMs: Date.now() - started,
          errorCode: 'schema_validation_failed',
          metadata: { error: String(repairError) },
        });
        throw repairError;
      }
    }
  }
}
