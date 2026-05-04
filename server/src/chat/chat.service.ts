import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import {
  SystemMessage,
  ToolMessage,
  type BaseMessageLike,
} from '@langchain/core/messages';
import { AgentsService } from '../agents/agents.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { CandidateGeneratorService } from './candidate-generator.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { createDocumentTools } from '../llm/tools/document.tools.js';
import type { Response } from 'express';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface InvokableDocumentTool {
  name: string;
  invoke(input: unknown): Promise<unknown>;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly settingsService: SettingsService,
    private readonly candidateGenerator: CandidateGeneratorService,
    private readonly documentsService: DocumentsService,
  ) {}

  async handleChat(messages: ChatMessage[], res: Response): Promise<void> {
    // Set SSE headers for Vercel AI SDK data stream protocol
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('x-vercel-ai-data-stream', 'v1');
    res.flushHeaders();

    try {
      // 1. Get LLM settings
      const settings = await this.settingsService.getSettings();
      if (!settings) {
        this.sendTextStream(
          res,
          '⚠️ Please configure LLM settings first. Click the Settings button in the sidebar.',
        );
        return;
      }

      // 2. Extract last message
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        this.sendTextStream(res, '⚠️ No user message found.');
        return;
      }

      // 3. Regex match for @handle
      const mentionMatch = lastMessage.content.match(/@([a-zA-Z0-9_]+)/);
      if (!mentionMatch) {
        this.sendTextStream(
          res,
          '💡 Please mention an agent using @handle. Type @ to see available agents.',
        );
        return;
      }

      const handle = mentionMatch[1];

      // 4. Lookup agent
      const agent = await this.agentsService.findByHandle(handle);
      if (!agent) {
        this.sendTextStream(
          res,
          `❌ Agent @${handle} not found or not hired yet.`,
        );
        return;
      }

      // 5. Check if this is an HR hiring request
      if (handle === 'hr' && this.isHiringIntent(lastMessage.content)) {
        await this.handleHiringRequest(lastMessage.content, settings, res);
        return;
      }

      // 6. Standard agent chat — stream via LangChain
      await this.streamAgentResponse(agent, messages, settings, res);
    } catch (err: any) {
      console.error('Chat error:', err);
      this.sendTextStream(res, `❌ Error: ${err.message ?? 'Unknown error'}`);
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
    userMessage: string,
    settings: { baseURL?: string; apiKey: string; modelName: string },
    res: Response,
  ): Promise<void> {
    const result = await this.candidateGenerator.generate(
      userMessage,
      settings,
    );

    // Stream the reply message as text chunks
    const words = result.replyMessage.split(' ');
    for (let i = 0; i < words.length; i++) {
      const chunk = (i === 0 ? '' : ' ') + words[i];
      res.write(`0:${JSON.stringify(chunk)}\n`);
      await this.delay(30);
    }

    // Append candidates as data part
    const candidateData = JSON.stringify([
      {
        type: 'CANDIDATES_LIST',
        payload: result.candidates,
      },
    ]);
    res.write(`2:${candidateData}\n`);

    // Finish message
    const finishData = JSON.stringify({
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0 },
      isContinued: false,
    });
    res.write(`d:${finishData}\n`);

    res.end();
  }

  private async streamAgentResponse(
    agent: { personality: string; name: string; handle: string },
    messages: ChatMessage[],
    settings: { baseURL?: string; apiKey: string; modelName: string },
    res: Response,
  ): Promise<void> {
    const llm = new ChatOpenAI({
      openAIApiKey: settings.apiKey,
      apiKey: settings.apiKey,
      modelName: settings.modelName,
      configuration: settings.baseURL
        ? { baseURL: settings.baseURL }
        : undefined,
      streaming: true,
    });

    const langchainMessages = await this.buildLangChainMessages(
      agent,
      messages,
    );

    const tools = createDocumentTools(this.documentsService);
    const llmWithTools = llm.bindTools(tools, { tool_choice: 'auto' });
    const toolDecision = await llmWithTools.invoke(langchainMessages);
    const toolCalls = toolDecision.tool_calls ?? [];

    if (toolCalls.length === 0) {
      this.sendTextStream(res, this.contentToText(toolDecision.content));
      return;
    }

    langchainMessages.push(toolDecision);

    const toolMap = new Map<string, InvokableDocumentTool>(
      tools.map((documentTool) => [
        documentTool.name,
        documentTool as InvokableDocumentTool,
      ]),
    );
    for (const toolCall of toolCalls.slice(0, 3)) {
      const documentTool = toolMap.get(toolCall.name);
      if (!documentTool) continue;

      const toolResult = await documentTool.invoke(toolCall);
      langchainMessages.push(
        toolResult instanceof ToolMessage
          ? toolResult
          : new ToolMessage({
              content: this.contentToText(toolResult),
              tool_call_id: toolCall.id ?? toolCall.name,
            }),
      );
    }

    const stream = await llm.stream(langchainMessages);

    for await (const chunk of stream) {
      const text = chunk.content;
      if (typeof text === 'string' && text.length > 0) {
        res.write(`0:${JSON.stringify(text)}\n`);
      }
    }

    // Finish
    const finishData = JSON.stringify({
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0 },
      isContinued: false,
    });
    res.write(`d:${finishData}\n`);

    res.end();
  }

  private async buildLangChainMessages(
    agent: { personality: string; name: string; handle: string },
    messages: ChatMessage[],
  ): Promise<BaseMessageLike[]> {
    const systemMessages: BaseMessageLike[] = [
      new SystemMessage(
        `You are ${agent.name} (@${agent.handle}). ${agent.personality}\n\n` +
          'You can create and edit specification documents with the available document tools. ' +
          'When a document tool returns a UUID, include it in your response prefixed with # so the workspace can open it.',
      ),
    ];

    const documentContext = await this.buildDocumentContextMessage(messages);
    if (documentContext) {
      systemMessages.push(documentContext);
    }

    return [
      ...systemMessages,
      ...messages.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
    ];
  }

  private async buildDocumentContextMessage(
    messages: ChatMessage[],
  ): Promise<SystemMessage | null> {
    const lastUserMessage = messages[messages.length - 1]?.content ?? '';
    const docMatches = [
      ...lastUserMessage.matchAll(/(?:^|\s)#([0-9a-fA-F-]{36})/g),
    ];
    const docIds = [...new Set(docMatches.map((match) => match[1]))];
    if (docIds.length === 0) return null;

    const referencedDocs =
      await this.documentsService.getDocumentsByIds(docIds);
    if (referencedDocs.length === 0) return null;

    return new SystemMessage(
      `The user referenced the following documents in their message. Use this context to answer:\n\n${referencedDocs
        .map(
          (doc) =>
            `Title: ${doc.title}\nContent: ${doc.contentMarkdown ?? ''}`,
        )
        .join('\n\n')}`,
    );
  }

  private contentToText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (
            part &&
            typeof part === 'object' &&
            'text' in part &&
            typeof (part as { text?: unknown }).text === 'string'
          ) {
            return (part as { text: string }).text;
          }
          return '';
        })
        .join('');
    }
    return content == null ? '' : String(content);
  }

  private sendTextStream(res: Response, text: string): void {
    res.write(`0:${JSON.stringify(text)}\n`);
    const finishData = JSON.stringify({
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0 },
      isContinued: false,
    });
    res.write(`d:${finishData}\n`);
    res.end();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
