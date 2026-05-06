import type { SpecVersion } from './types';

function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function nextDraftVersion(
  latest?: Pick<SpecVersion, 'version'>,
  changeKind: 'major' | 'minor' | 'patch' = 'minor',
): string {
  if (!latest) {
    return '0.1.0';
  }

  const [major, minor, patch] = parseVersion(latest.version);

  if (major >= 1 && changeKind !== 'patch') {
    return `${major + 0}.${minor + 1}.0`;
  }

  if (changeKind === 'patch') {
    return `${major}.${minor}.${patch + 1}`;
  }

  if (changeKind === 'major') {
    return `${Math.max(major + 1, 1)}.0.0`;
  }

  return `${major}.${minor + 1}.0`;
}

export function approvedVersion(): string {
  return '1.0.0';
}
