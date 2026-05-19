import { formatArgsForLog, FLAG_ARG_PATTERN } from './cli-provider.base';

describe('formatArgsForLog', () => {
  it('logs short and long flag-form args verbatim', () => {
    const out = formatArgsForLog(['-p', '--skip-git-repo-check', '--json']);
    expect(out).toBe('-p --skip-git-repo-check --json');
  });

  it('replaces positional args with a length-only marker', () => {
    const out = formatArgsForLog(['exec', '--json', 'reply with the word ok']);
    expect(out).toBe('<arg:len=4> --json <arg:len=22>');
  });

  it('does not leak user prompt content even when SILSOL_TOKEN is not present', () => {
    const prompt = 'patient SSN 123-45-6789 wants medical advice';
    const out = formatArgsForLog([
      '--config',
      'approval_policy="never"',
      prompt,
    ]);
    // Flag is logged verbatim, the config payload and prompt are masked.
    expect(out).toContain('--config');
    expect(out).not.toContain('approval_policy');
    expect(out).not.toContain('SSN');
    expect(out).not.toContain('123-45-6789');
    expect(out).toContain(`<arg:len=${prompt.length}>`);
  });

  it('does not log SILSOL_TOKEN values that appear inside positional args', () => {
    // Codex passes mcp env via a single positional like
    //   mcp_servers.siliconsouls.env={SILSOL_TOKEN="abc123",...}
    const envArg =
      'mcp_servers.siliconsouls.env={SILSOL_SESSION_ID="sess",SILSOL_TOKEN="abc-secret-123"}';
    const out = formatArgsForLog(['--config', envArg]);
    expect(out).not.toContain('abc-secret-123');
    expect(out).not.toContain('SILSOL_TOKEN');
  });

  it('does not classify flag-with-value forms (--flag=value) as safe flags', () => {
    // `--config=secret` would otherwise log the secret verbatim.
    const out = formatArgsForLog(['--config=top-secret-payload']);
    expect(out).not.toContain('top-secret-payload');
    expect(out).toBe('<arg:len=27>');
  });

  it('does not treat a positional starting with "-" as a flag', () => {
    // Users can type chat messages starting with a dash; those must not
    // leak via the flag fast-path.
    const out = formatArgsForLog(['--prompt', '-please summarize this']);
    expect(out).toBe('--prompt <arg:len=22>');
  });

  it('truncates extremely long flag-form args defensively', () => {
    const longFlag = '--' + 'a'.repeat(500);
    const out = formatArgsForLog([longFlag]);
    expect(out.length).toBeLessThan(longFlag.length);
    expect(out).toMatch(/^--a+…$/);
  });
});

describe('FLAG_ARG_PATTERN', () => {
  it('matches conventional flag forms', () => {
    for (const f of ['-p', '--json', '-x', '--skip-git-repo-check']) {
      expect(FLAG_ARG_PATTERN.test(f)).toBe(true);
    }
  });

  it('rejects flag-with-value, positional, and empty inputs', () => {
    for (const a of [
      '--config=value',
      'exec',
      'approval_policy="never"',
      '',
      '-',
      '--',
      '-123',
    ]) {
      expect(FLAG_ARG_PATTERN.test(a)).toBe(false);
    }
  });
});
