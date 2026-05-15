import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import * as crypto from 'node:crypto';

interface PendingToolCall {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timeoutHandle: NodeJS.Timeout;
  toolName: string;
}

export interface ChatSession {
  sessionId: string;
  token: string;
  res: Response;
  abortController: AbortController;
  pendingToolCalls: Map<string, PendingToolCall>;
  createdAt: number;
}

@Injectable()
export class ChatSessionStore {
  private readonly logger = new Logger(ChatSessionStore.name);
  private readonly sessions = new Map<string, ChatSession>();

  create(res: Response): ChatSession {
    const sessionId = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('base64url');
    const abortController = new AbortController();
    const session: ChatSession = {
      sessionId,
      token,
      res,
      abortController,
      pendingToolCalls: new Map(),
      createdAt: Date.now(),
    };
    this.sessions.set(sessionId, session);

    const cleanup = (): void => {
      abortController.abort();
      for (const pending of session.pendingToolCalls.values()) {
        clearTimeout(pending.timeoutHandle);
        pending.reject(new Error('Chat session closed'));
      }
      this.sessions.delete(sessionId);
    };
    res.on('close', cleanup);
    res.on('finish', () => this.sessions.delete(sessionId));

    return session;
  }

  get(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  getByToken(sessionId: string, token: string): ChatSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.token !== token) return undefined;
    return session;
  }

  registerToolCall(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    timeoutMs: number,
  ): Promise<unknown> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error(`Unknown session: ${sessionId}`));
    }
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        session.pendingToolCalls.delete(toolCallId);
        reject(new Error(`Tool call ${toolName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      session.pendingToolCalls.set(toolCallId, {
        resolve,
        reject,
        timeoutHandle,
        toolName,
      });
    });
  }

  resolveToolCall(
    sessionId: string,
    toolCallId: string,
    result: unknown,
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const pending = session.pendingToolCalls.get(toolCallId);
    if (!pending) return false;
    clearTimeout(pending.timeoutHandle);
    session.pendingToolCalls.delete(toolCallId);
    pending.resolve(result);
    return true;
  }

  writeData(sessionId: string, dataPart: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.res.write(`2:${JSON.stringify([dataPart])}\n`);
    } catch (err) {
      this.logger.warn(`Failed to write data part: ${(err as Error).message}`);
    }
  }
}
