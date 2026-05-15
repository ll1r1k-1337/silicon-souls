import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentsService } from '../agents/agents.service.js';
import type { LlmSettings } from '../settings/settings.service.js';
import { createProvider } from '../llm/llm-provider.factory.js';

const candidateItemSchema = z.object({
  handle: z.string(),
  name: z.string(),
  role: z.string(),
  personality: z.string(),
  skills: z.array(z.string()),
  expectedSalary: z.string(),
  hrComment: z.string(),
});

const candidateSchema = z.object({
  replyMessage: z.string(),
  candidates: z.array(candidateItemSchema).length(3),
});

const PROMPT_TEMPLATE = `You are a professional HR Manager at Silicon Souls. The user has asked you to find or hire someone. Generate exactly 3 realistic, diverse candidates.

Respond ONLY with a single JSON object (no markdown fences, no commentary). The JSON must match this shape exactly:

{
  "replyMessage": "<a short message presenting the candidates>",
  "candidates": [
    {
      "handle": "<lowercase_underscored_handle>",
      "name": "<full name>",
      "role": "<job title>",
      "personality": "<paragraph describing personality>",
      "skills": ["<skill1>", "<skill2>", "<skill3>"],
      "expectedSalary": "<salary with currency>",
      "hrComment": "<HR assessment>"
    }
    // ... exactly 3 entries
  ]
}

User request: `;

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

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
      personality: string;
      skills: string[];
      expectedSalary: string;
      hrComment: string;
    }>;
  }> {
    const provider = createProvider(llmSettings);

    let collected = '';
    for await (const chunk of provider.stream({
      messages: [
        { role: 'system', content: 'You respond only with strict JSON.' },
        { role: 'user', content: PROMPT_TEMPLATE + userMessage },
      ],
      sessionId: 'candidate-generator',
    })) {
      if (chunk.type === 'text' && chunk.text) collected += chunk.text;
    }

    const jsonText = extractJson(collected);
    if (!jsonText) {
      throw new Error('LLM did not return parseable JSON');
    }
    const parsed = candidateSchema.parse(JSON.parse(jsonText));

    const saved = await this.agentsService.createCandidates(
      parsed.candidates.map((c) => ({
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
      replyMessage: parsed.replyMessage,
      candidates: saved.map((s, i) => ({
        id: s.id,
        handle: s.handle,
        name: s.name,
        role: s.role,
        personality: s.personality,
        skills: parsed.candidates[i].skills,
        expectedSalary: parsed.candidates[i].expectedSalary,
        hrComment: parsed.candidates[i].hrComment,
      })),
    };
  }
}
