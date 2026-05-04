import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseMessageLike } from '@langchain/core/messages';
import { z } from 'zod';
import { AgentsService } from '../agents/agents.service.js';
import type { LlmSettings } from '../settings/settings.service.js';

const candidateSchema = z.object({
  replyMessage: z.string().describe('A reply message from HR about the candidates being presented'),
  candidates: z
    .array(
      z.object({
        handle: z.string().describe('A short unique handle for the candidate, lowercase with underscores'),
        name: z.string().describe('Full name of the candidate'),
        role: z.string().describe('Job title / role the candidate is being hired for'),
        personality: z.string().describe('A paragraph describing the candidate personality and work style'),
        skills: z.array(z.string()).describe('List of 3-5 relevant technical skills'),
        expectedSalary: z.string().describe('Expected annual salary with currency'),
        hrComment: z.string().describe('HR assessment comment about the candidate'),
      }),
    )
    .length(3),
});

type CandidateGenerationResult = z.infer<typeof candidateSchema>;

@Injectable()
export class CandidateGeneratorService {
  constructor(private readonly agentsService: AgentsService) {}

  async generate(
    userMessage: string,
    llmSettings: LlmSettings,
  ): Promise<{
    replyMessage: string;
    candidates: Array<{
      id: string;
      handle: string;
      name: string;
      role: string;
      skills: string[];
      expectedSalary: string;
      hrComment: string;
    }>;
  }> {
    const llm = new ChatOpenAI({
      openAIApiKey: llmSettings.apiKey,
      apiKey: llmSettings.apiKey,
      modelName: llmSettings.modelName,
      configuration: llmSettings.baseURL
        ? { baseURL: llmSettings.baseURL }
        : undefined,
      maxRetries: 1,
      maxTokens: 1200,
      temperature: 0,
      timeout: 60_000,
    });

    const messages: BaseMessageLike[] = [
      {
        role: 'system',
        content:
          'You are a professional HR Manager at Silicon Souls. When the user asks you to find or hire someone for a role, generate exactly 3 realistic, diverse candidates. Each candidate should have a unique handle (lowercase, underscores allowed), a realistic name, relevant skills, and a thoughtful HR assessment.\n\n' +
          'Return only strict JSON. Do not wrap it in markdown. Do not use JSON5. Do not include comments or trailing commas. Use this exact shape:\n' +
          '{\n' +
          '  "replyMessage": "A short HR reply message",\n' +
          '  "candidates": [\n' +
          '    {\n' +
          '      "handle": "lowercase_unique_handle",\n' +
          '      "name": "Full Name",\n' +
          '      "role": "Job title",\n' +
          '      "personality": "A paragraph describing work style",\n' +
          '      "skills": ["Skill 1", "Skill 2", "Skill 3"],\n' +
          '      "expectedSalary": "$000,000",\n' +
          '      "hrComment": "HR assessment comment"\n' +
          '    }\n' +
          '  ]\n' +
          '}',
      },
      { role: 'user', content: userMessage },
    ];

    const result = await this.generateCandidateJson(llm, messages);

    // Save candidates to DB
    const saved = await this.agentsService.createCandidates(
      result.candidates.map((c) => ({
        handle: c.handle,
        name: c.name,
        role: c.role,
        personality: c.personality,
        skills: c.skills,
        expectedSalary: c.expectedSalary,
        hrComment: c.hrComment,
      })),
    );

    return {
      replyMessage: result.replyMessage,
      candidates: saved.map((s, i) => ({
        id: s.id,
        handle: s.handle,
        name: s.name,
        role: s.role,
        skills: result.candidates[i].skills,
        expectedSalary: result.candidates[i].expectedSalary,
        hrComment: result.candidates[i].hrComment,
      })),
    };
  }

  private async generateCandidateJson(
    llm: ChatOpenAI,
    messages: BaseMessageLike[],
  ): Promise<CandidateGenerationResult> {
    const response = await llm.invoke(messages);
    return this.parseCandidateGeneration(this.contentToText(response.content));
  }

  private parseCandidateGeneration(text: string): CandidateGenerationResult {
    const jsonText = this.extractJsonText(text);
    return candidateSchema.parse(JSON.parse(jsonText));
  }

  private extractJsonText(text: string): string {
    let jsonText = text.trim();
    const fenced = jsonText.match(/```(?:json|json5)?\s*([\s\S]*?)```/i);
    if (fenced) {
      jsonText = fenced[1].trim();
    }

    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      jsonText = jsonText.slice(start, end + 1);
    }

    return this.stripJsonComments(jsonText).replace(/,\s*([}\]])/g, '$1');
  }

  private stripJsonComments(text: string): string {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        result += char;
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      if (!inString && char === '/' && next === '/') {
        while (i < text.length && text[i] !== '\n') i++;
        result += '\n';
        continue;
      }

      result += char;
    }

    return result;
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
}
