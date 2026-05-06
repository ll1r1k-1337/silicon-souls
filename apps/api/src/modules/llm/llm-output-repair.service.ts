import { Injectable } from '@nestjs/common';
import type { LlmProvider, RunStructuredParams } from './llm.interfaces';

@Injectable()
export class LlmOutputRepairService {
  async repairStructuredOutput<Input, Output>(
    provider: LlmProvider,
    params: RunStructuredParams<Input, Output>,
    error: unknown,
  ): Promise<Output> {
    const repairMessages = [
      ...params.messages,
      {
        role: 'system' as const,
        content:
          'The previous output failed validation. Return corrected structured output only. Validation error: ' +
          String(error),
      },
    ];

    return provider.invokeStructured({
      chainName: params.chainName,
      input: params.input,
      messages: repairMessages,
      outputSchema: params.outputSchema,
      options: {
        ...params.options,
        metadata: {
          ...params.options?.metadata,
          repairAttempt: true,
        },
      },
    });
  }
}
