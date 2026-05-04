import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DocumentsService } from '../../documents/documents.service.js';

export function createDocumentTool(documentsService: DocumentsService) {
  return tool(
    async ({ title, initialContentMarkdown }) => {
      return documentsService.createDocument(title, initialContentMarkdown);
    },
    {
      name: 'create_document',
      description: 'Creates a new specification document and returns its ID.',
      schema: z.object({
        title: z.string(),
        initialContentMarkdown: z
          .string()
          .describe('Markdown formatted text'),
      }),
    },
  );
}

export function editDocumentTool(documentsService: DocumentsService) {
  return tool(
    async ({ docId, newContentMarkdown }) => {
      await documentsService.overwriteDocument(docId, newContentMarkdown);
      return 'Document successfully updated.';
    },
    {
      name: 'edit_document',
      description:
        'Overwrites the content of an existing document. Use this to apply fixes.',
      schema: z.object({
        docId: z.string().uuid(),
        newContentMarkdown: z
          .string()
          .describe('Complete new markdown content'),
      }),
    },
  );
}

export function createDocumentTools(documentsService: DocumentsService) {
  return [
    createDocumentTool(documentsService),
    editDocumentTool(documentsService),
  ];
}
