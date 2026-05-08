import { describe, expect, it, vi, afterEach } from 'vitest';
import { apiRequest } from './client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiRequest', () => {
  it('returns undefined for 204 responses with no content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await apiRequest<undefined>('/health');

    expect(result).toBeUndefined();
  });

  it('parses JSON response bodies when present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await apiRequest<{ ok: boolean }>('/health');

    expect(result).toEqual({ ok: true });
  });
});
