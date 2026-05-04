import { Controller, Get } from '@nestjs/common';
import { DocumentsService } from './documents.service.js';

@Controller('api/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async list() {
    const documents = await this.documentsService.listDocuments();
    return { documents };
  }
}
