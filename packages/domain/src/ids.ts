export type IdPrefix =
  | 'prj'
  | 'spec'
  | 'msg'
  | 'doc'
  | 'dct'
  | 'dcm'
  | 'dsg'
  | 'art'
  | 'req'
  | 'asm'
  | 'oq'
  | 'ac'
  | 'risk'
  | 'dec'
  | 'ver'
  | 'rev'
  | 'evt'
  | 'job'
  | 'llm'
  | 'usr'
  | 'goal'
  | 'ng'
  | 'scn';

export function createPrefixedId(prefix: IdPrefix): string {
  const random =
    globalThis.crypto?.randomUUID?.().replaceAll('-', '') ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${random.slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
