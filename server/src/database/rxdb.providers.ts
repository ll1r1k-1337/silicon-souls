import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createRxDatabase,
  addRxPlugin,
  type RxDatabase,
  type RxCollection,
  type RxDumpDatabaseAny,
} from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBJsonDumpPlugin } from 'rxdb/plugins/json-dump';
import { agentSchema, type AgentDoc } from './schemas/agent.schema.js';
import {
  systemSettingSchema,
  type SystemSettingDoc,
} from './schemas/system-settings.schema.js';

addRxPlugin(RxDBJsonDumpPlugin);

export const RXDB_DATABASE = Symbol('RXDB_DATABASE');

export type Collections = {
  agents: RxCollection<AgentDoc>;
  systemSettings: RxCollection<SystemSettingDoc>;
};

export type SilSolDatabase = RxDatabase<Collections>;

export function getDataDir(): string {
  return (
    process.env.SILICON_SOULS_HOME ?? path.join(os.homedir(), '.silicon-souls')
  );
}

function dumpPath(): string {
  return path.join(getDataDir(), 'db', 'dump.json');
}

async function loadDump(db: SilSolDatabase): Promise<void> {
  const file = dumpPath();
  if (!fs.existsSync(file)) return;
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as RxDumpDatabaseAny<Collections>;
    await db.importJSON(parsed);
    console.log(`📂 Loaded database from ${file}`);
  } catch (err) {
    console.error(`⚠️  Failed to load DB dump (${file}):`, err);
  }
}

function attachPersistence(db: SilSolDatabase): void {
  const file = dumpPath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  let timer: NodeJS.Timeout | null = null;
  let writing = false;

  const flush = (): void => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void writeDump();
    }, 300);
  };

  const writeDump = async (): Promise<void> => {
    if (writing) {
      flush();
      return;
    }
    writing = true;
    try {
      const dump = await db.exportJSON();
      await fs.promises.writeFile(file, JSON.stringify(dump));
    } catch (err) {
      console.error('⚠️  Failed to persist DB dump:', err);
    } finally {
      writing = false;
    }
  };

  for (const collection of Object.values(db.collections) as RxCollection[]) {
    collection.$.subscribe(() => flush());
  }

  const writeSync = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void writeDump();
  };
  process.on('beforeExit', writeSync);
  process.on('SIGINT', () => {
    writeSync();
    setTimeout(() => process.exit(0), 200);
  });
  process.on('SIGTERM', () => {
    writeSync();
    setTimeout(() => process.exit(0), 200);
  });
}

export const rxdbProvider = {
  provide: RXDB_DATABASE,
  useFactory: async (): Promise<SilSolDatabase> => {
    const db = await createRxDatabase<Collections>({
      name: 'siliconsouls',
      storage: getRxStorageMemory(),
      ignoreDuplicate: true,
    });

    await db.addCollections({
      agents: { schema: agentSchema },
      systemSettings: { schema: systemSettingSchema },
    });

    await loadDump(db);
    attachPersistence(db);

    return db;
  },
};
