import { Injectable } from '@nestjs/common';
import { ProductSpecJsonSchema } from '@sdd/schemas';
import {
  buildBundleFiles,
  buildLlmPromptExport,
  buildStage1InputBundle,
  renderProductSpecMarkdown,
} from '@sdd/spec-format';
import JSZip from 'jszip';
import { SpecSessionsService } from '../spec-sessions/spec-sessions.service';

@Injectable()
export class ExportsService {
  constructor(private readonly sessions: SpecSessionsService) {}

  async exportMarkdown(sessionId: string): Promise<string> {
    const latest = await this.sessions.getLatestVersion(sessionId);
    if (latest) {
      return latest.markdownSnapshot;
    }

    return renderProductSpecMarkdown(await this.sessions.assembleSpec(sessionId));
  }

  async exportJson(sessionId: string): Promise<Record<string, unknown>> {
    const latest = await this.sessions.getLatestVersion(sessionId);
    if (latest) {
      return ProductSpecJsonSchema.parse(latest.jsonSnapshot) as Record<string, unknown>;
    }

    return this.sessions.assembleSpec(sessionId) as unknown as Record<string, unknown>;
  }

  async exportBundle(sessionId: string): Promise<Buffer> {
    const markdown = await this.exportMarkdown(sessionId);
    const spec = ProductSpecJsonSchema.parse(await this.exportJson(sessionId));
    buildStage1InputBundle(markdown, spec);
    const files = buildBundleFiles(markdown, spec);
    const zip = new JSZip();

    for (const [name, content] of Object.entries(files)) {
      zip.file(name, content);
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  async exportLlmPrompt(sessionId: string): Promise<string> {
    const markdown = await this.exportMarkdown(sessionId);
    const spec = ProductSpecJsonSchema.parse(await this.exportJson(sessionId));
    return buildLlmPromptExport(markdown, spec);
  }
}
