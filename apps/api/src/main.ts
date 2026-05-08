import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RealtimeEventsService } from './shared/events/realtime-events.service';
import { WebSocketServer, WebSocket } from 'ws';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const realtimeEvents = app.get(RealtimeEventsService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN') ?? true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const wsServer = new WebSocketServer({
    server: app.getHttpServer() as Parameters<typeof WebSocketServer>[0]['server'],
    path: '/ws',
  });

  realtimeEvents.subscribe((event) => {
    const message = JSON.stringify(event);
    wsServer.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  await app.listen(config.get<number>('API_PORT') ?? 3000);
}

void bootstrap();
