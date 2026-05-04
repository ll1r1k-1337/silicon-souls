import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentGateway } from './document.gateway.js';
import { DocumentsRealtimeService } from './documents-realtime.service.js';
import { DocumentsService } from './documents.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRealtimeService, DocumentGateway],
  exports: [DocumentsService],
})
export class DocumentsModule {}
