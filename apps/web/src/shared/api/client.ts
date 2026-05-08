export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const baseUrl = import.meta.env.VITE_API_URL ?? '/api';

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const parsed = await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(
      typeof parsed === 'object' && parsed && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : response.statusText,
      response.status,
      parsed,
    );
  }

  return parsed as T;
}

export type ExportFormat = 'markdown' | 'json' | 'bundle' | 'llm-prompt';

export function exportUrl(sessionId: string, format: ExportFormat): string {
  return `${baseUrl}/spec-sessions/${sessionId}/export?format=${format}`;
}
