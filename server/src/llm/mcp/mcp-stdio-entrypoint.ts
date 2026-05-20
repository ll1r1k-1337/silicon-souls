/**
 * Stdio MCP server entrypoint spawned by CLI subprocesses (claude/codex/gemini).
 * Speaks MCP-over-stdio to its parent CLI; forwards tool calls to the main
 * Nest process via a loopback HTTP POST.
 *
 * Env vars required:
 *   - SILSOL_SESSION_ID  : the chat session id
 *   - SILSOL_TOKEN       : per-session auth token
 *   - SILSOL_API_BASE    : e.g. http://127.0.0.1:3000
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolSpec[] = [
  {
    name: 'present_candidates',
    description:
      'Present 3 candidate agents to the user for selection. Returns the candidate the user picked. Use this when the user asks you to find, recruit, or hire someone.',
    inputSchema: {
      type: 'object',
      properties: {
        candidates: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              handle: {
                type: 'string',
                description: 'Short unique handle, lowercase with underscores',
              },
              name: { type: 'string', description: 'Full name' },
              role: { type: 'string', description: 'Job title' },
              personality: {
                type: 'string',
                description: 'Paragraph describing personality and work style',
              },
              skills: {
                type: 'array',
                items: { type: 'string' },
                description: '3-5 relevant skills',
              },
              expectedSalary: {
                type: 'string',
                description: 'Expected annual salary with currency',
              },
              hrComment: {
                type: 'string',
                description: 'HR assessment of the candidate',
              },
            },
            required: [
              'handle',
              'name',
              'role',
              'personality',
              'skills',
              'expectedSalary',
              'hrComment',
            ],
          },
        },
      },
      required: ['candidates'],
    },
  },
];

async function main(): Promise<void> {
  const sessionId = process.env.SILSOL_SESSION_ID;
  const token = process.env.SILSOL_TOKEN;
  const apiBase = process.env.SILSOL_API_BASE ?? 'http://127.0.0.1:3000';

  if (!sessionId || !token) {
    process.stderr.write(
      'mcp-stdio-entrypoint: SILSOL_SESSION_ID and SILSOL_TOKEN required\n',
    );
    process.exit(1);
  }

  const server = new Server(
    { name: 'siliconsouls', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve({ tools: TOOLS }),
  );

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const url = `${apiBase}/api/internal/mcp/${sessionId}/tool`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-token': token,
      },
      body: JSON.stringify({ toolName: name, args }),
    });
    const body = (await response.json()) as {
      result?: unknown;
      error?: string;
    };
    if (body.error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${body.error}` }],
        isError: true,
      };
    }
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(body.result ?? {}) },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `mcp-stdio-entrypoint fatal: ${(err as Error).stack ?? err}\n`,
  );
  process.exit(1);
});
