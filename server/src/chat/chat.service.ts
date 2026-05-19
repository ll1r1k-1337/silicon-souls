import { Injectable } from '@nestjs/common';
import { AgentsService } from '../agents/agents.service.js';
import {
  SettingsService,
  type LlmSettings,
} from '../settings/settings.service.js';
import { CandidateGeneratorService } from './candidate-generator.service.js';
import { ChatSessionStore } from './session-store.js';
import { PresentCandidatesTool } from '../llm/tools/present-candidates.tool.js';
import { createProvider } from '../llm/llm-provider.factory.js';
import type {
  LlmMessage,
  StreamOptions,
} from '../llm/llm-provider.interface.js';
import type { Response } from 'express';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly settingsService: SettingsService,
    private readonly candidateGenerator: CandidateGeneratorService,
    private readonly sessionStore: ChatSessionStore,
    private readonly presentCandidatesTool: PresentCandidatesTool,
  ) {}

  async handleChat(messages: ChatMessage[], res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('x-vercel-ai-data-stream', 'v1');
    res.flushHeaders();

    const session = this.sessionStore.create(res);

    try {
      const settings = await this.settingsService.getSettings();
      if (!settings) {
        this.sendTextStream(
          res,
          '⚠️ Please configure LLM settings first. Click the Settings button in the sidebar.',
        );
        return;
      }

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        this.sendTextStream(res, '⚠️ No user message found.');
        return;
      }

      const mentionMatch = lastMessage.content.match(/@([a-zA-Z0-9_]+)/);
      if (!mentionMatch) {
        this.sendTextStream(
          res,
          '💡 Please mention an agent using @handle. Type @ to see available agents.',
        );
        return;
      }
      const handle = mentionMatch[1];

      const agent = await this.agentsService.findByHandle(handle);
      if (!agent) {
        this.sendTextStream(
          res,
          `❌ Agent @${handle} not found or not hired yet.`,
        );
        return;
      }

      if (handle === 'hr' && this.isHiringIntent(lastMessage.content)) {
        if (settings.providerType === 'gemini-cli') {
          await this.handleHiringRequestFallback(
            lastMessage.content,
            settings,
            res,
          );
        } else {
          await this.handleHiringRequest(
            agent,
            messages,
            settings,
            session,
            res,
          );
        }
        return;
      }

      await this.streamAgentResponse(agent, messages, settings, session, res);
    } catch (err) {
      console.error('Chat error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      this.sendTextStream(res, `❌ Error: ${msg}`);
    }
  }

  private isHiringIntent(content: string): boolean {
    const hiringKeywords = [
      'hire',
      'find',
      'recruit',
      'need a',
      'looking for',
      'search for',
      'candidate',
      'developer',
      'engineer',
      'designer',
      'manager',
      'new team member',
    ];
    const lower = content.toLowerCase();
    return hiringKeywords.some((kw) => lower.includes(kw));
  }

  private async handleHiringRequest(
    agent: { personality: string; name: string; handle: string },
    messages: ChatMessage[],
    settings: LlmSettings,
    session: ReturnType<ChatSessionStore['create']>,
    res: Response,
  ): Promise<void> {
    const provider = createProvider(settings);
    const llmMessages: LlmMessage[] = [
      {
        role: 'system',
        content: `You are ${agent.name} (@${agent.handle}). ${agent.personality}

When the user asks you to find, recruit, or hire someone, you MUST call the present_candidates tool with exactly 3 diverse, realistic candidates. After the user picks one (you'll see the selection in the tool result), congratulate them and confirm the hire.`,
      },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const tools = [this.presentCandidatesTool.toTool()];

    const streamOpts: StreamOptions & { _token?: string } = {
      messages: llmMessages,
      tools,
      sessionId: session.sessionId,
      signal: session.abortController.signal,
    };
    streamOpts._token = session.token;

    for await (const chunk of provider.stream(streamOpts)) {
      if (chunk.type === 'text' && chunk.text) {
        res.write(`0:${JSON.stringify(chunk.text)}\n`);
      } else if (chunk.type === 'thinking' && chunk.thinking) {
        res.write(`g:${JSON.stringify(chunk.thinking)}\n`);
      } else if (chunk.type === 'error' && chunk.error) {
        res.write(`0:${JSON.stringify(`\n⚠️ ${chunk.error}\n`)}\n`);
      }
    }
    this.writeFinish(res);
  }

  private async handleHiringRequestFallback(
    userMessage: string,
    settings: LlmSettings,
    res: Response,
  ): Promise<void> {
    const result = await this.candidateGenerator.generate(
      userMessage,
      settings,
    );

    const words = result.replyMessage.split(' ');
    for (let i = 0; i < words.length; i++) {
      const chunk = (i === 0 ? '' : ' ') + words[i];
      res.write(`0:${JSON.stringify(chunk)}\n`);
      await this.delay(30);
    }
    const candidateData = JSON.stringify([
      { type: 'CANDIDATES_LIST', payload: result.candidates },
    ]);
    res.write(`2:${candidateData}\n`);
    this.writeFinish(res);
  }

  private async streamAgentResponse(
    agent: { personality: string; name: string; handle: string },
    messages: ChatMessage[],
    settings: LlmSettings,
    session: ReturnType<ChatSessionStore['create']>,
    res: Response,
  ): Promise<void> {
    const provider = createProvider(settings);
    const llmMessages: LlmMessage[] = [
      {
        role: 'system',
        content: `You are ${agent.name} (@${agent.handle}). ${agent.personality}`,
      },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const streamOpts: StreamOptions & { _token?: string } = {
      messages: llmMessages,
      sessionId: session.sessionId,
      signal: session.abortController.signal,
    };
    streamOpts._token = session.token;

    for await (const chunk of provider.stream(streamOpts)) {
      if (chunk.type === 'text' && chunk.text) {
        res.write(`0:${JSON.stringify(chunk.text)}\n`);
      } else if (chunk.type === 'thinking' && chunk.thinking) {
        res.write(`g:${JSON.stringify(chunk.thinking)}\n`);
      } else if (chunk.type === 'error' && chunk.error) {
        res.write(`0:${JSON.stringify(`\n⚠️ ${chunk.error}\n`)}\n`);
      }
    }
    this.writeFinish(res);
  }

  private writeFinish(res: Response): void {
    const finishData = JSON.stringify({
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0 },
      isContinued: false,
    });
    res.write(`d:${finishData}\n`);
    res.end();
  }

  private sendTextStream(res: Response, text: string): void {
    res.write(`0:${JSON.stringify(text)}\n`);
    this.writeFinish(res);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
