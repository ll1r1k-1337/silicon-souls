import { Controller, Post, Body, Res } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import express from 'express';

@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(
    @Body()
    body: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
    @Res() res: express.Response,
  ): Promise<void> {
    await this.chatService.handleChat(body.messages, res);
  }
}
