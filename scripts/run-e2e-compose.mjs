import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const requiredEnv = ['BASE_URL', 'API_KEY', 'MODEL_ID'];
const env = loadE2eEnv();
const missing = requiredEnv.filter((name) => !env[name]?.trim());

if (missing.length > 0) {
  console.error(
    `Missing required e2e LLM environment variables: ${missing.join(', ')}.`,
  );
  console.error(
    'Set BASE_URL, API_KEY, and MODEL_ID. API_KEY is passed through without being printed.',
  );
  process.exit(1);
}

const composeArgs = [
  'compose',
  '-p',
  'silsol-e2e',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.e2e.yml',
];

function runDocker(args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      cwd: process.cwd(),
      env: { ...env, COMPOSE_PROJECT_NAME: 'silsol-e2e' },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      const exitCode = code ?? 1;
      if (exitCode !== 0 && !allowFailure) {
        reject(new Error(`docker ${args.join(' ')} exited with ${exitCode}`));
        return;
      }
      resolve(exitCode);
    });
  });
}

function loadE2eEnv() {
  return {
    ...readEnvFile('.env.e2e'),
    ...readEnvFile('.env.e2e.local'),
    ...process.env,
  };
}

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }

  return values;
}

await runDocker([...composeArgs, 'down', '-v', '--remove-orphans'], {
  allowFailure: true,
});

let exitCode = 1;
try {
  exitCode = await runDocker([
    ...composeArgs,
    'up',
    '--build',
    '--abort-on-container-exit',
    '--exit-code-from',
    'e2e',
    'e2e',
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  await runDocker([...composeArgs, 'down', '-v', '--remove-orphans'], {
    allowFailure: true,
  });
}

process.exit(exitCode);
