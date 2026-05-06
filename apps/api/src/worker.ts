import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BackgroundWorkerService } from './worker/background-worker.service';
import { WorkerModule } from './worker/worker.module';

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const logger = new Logger('Stage0Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const worker = app.get(BackgroundWorkerService);
  const once = process.argv.includes('--once');

  logger.log(once ? 'Processing one queued job.' : 'Worker loop started.');

  try {
    do {
      const processed = await worker.processOnce();
      if (once) {
        break;
      }
      if (!processed) {
        await sleep(1000);
      }
    } while (true);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
