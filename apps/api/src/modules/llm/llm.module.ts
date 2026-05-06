import { Module } from '@nestjs/common';
import { CriticChain } from './chains/critic.chain';
import { ExtractorChain } from './chains/extractor.chain';
import { InterviewerChain } from './chains/interviewer.chain';
import { ReviewerChain } from './chains/reviewer.chain';
import { SpecWriterChain } from './chains/spec-writer.chain';
import { LlmChainRunner } from './llm-chain-runner.service';
import { LlmOutputRepairService } from './llm-output-repair.service';
import { LlmProviderResolver } from './llm-provider.resolver';
import { LlmTracingService } from './llm-tracing.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [
    LlmProviderResolver,
    LlmOutputRepairService,
    LlmTracingService,
    LlmChainRunner,
    ExtractorChain,
    InterviewerChain,
    SpecWriterChain,
    CriticChain,
    ReviewerChain,
  ],
  exports: [
    LlmProviderResolver,
    ExtractorChain,
    InterviewerChain,
    SpecWriterChain,
    CriticChain,
    ReviewerChain,
  ],
})
export class LlmModule {}
