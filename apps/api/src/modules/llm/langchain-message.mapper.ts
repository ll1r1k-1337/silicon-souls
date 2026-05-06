import type { BaseMessageLike } from '@langchain/core/messages';
import type { LlmMessage } from './llm.interfaces';

const roleMap = {
  system: 'system',
  user: 'human',
  assistant: 'ai',
} as const;

export function toLangChainMessages(messages: LlmMessage[]): BaseMessageLike[] {
  return messages.map(
    (message) => [roleMap[message.role], message.content] as BaseMessageLike,
  );
}
