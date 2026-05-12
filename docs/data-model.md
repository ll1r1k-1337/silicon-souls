# Модель данных

## 1. Основные сущности

```text
User
  -> Project
     -> ChatSession
        -> Message
     -> Documentation
        -> DocumentationVersion
     -> LlmCall
     -> AuditEvent
```

В MVP нет отдельной модели worker jobs, review reports и structured artifacts. Документация хранится как текущий Markdown-документ, который пользователь видит в read-only режиме и меняет только через чат.

## 2. Project

Проект объединяет чат, текущую документацию, историю изменений и настройки.

```ts
type ProjectStatus =
  | 'active'
  | 'archived';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}
```

## 3. ChatSession

Сессия описывает один рабочий диалог по документации проекта.

```ts
type ChatSessionStatus =
  | 'active'
  | 'archived';

interface ChatSession {
  id: string;
  projectId: string;
  status: ChatSessionStatus;
  createdAt: string;
  updatedAt: string;
}
```

## 4. Message

Сообщение хранит диалог. Сообщение пользователя является запросом на изменение, а сообщение ассистента объясняет результат или задаёт уточняющий вопрос.

```ts
interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}
```

## 5. Documentation

Документация хранит текущий Markdown. Пользователь не редактирует это поле напрямую.

```ts
interface Documentation {
  id: string;
  projectId: string;
  title: string;
  markdown: string;
  lastChangeSummary?: string;
  updatedBy: 'llm' | 'system';
  createdAt: string;
  updatedAt: string;
}
```

## 6. DocumentationVersion

Версия фиксирует snapshot документации после валидного изменения через LLM.

```ts
interface DocumentationVersion {
  id: string;
  documentationId: string;
  projectId: string;
  version: number;
  markdownSnapshot: string;
  changeSummary: string;
  sourceMessageId?: string;
  createdBy: 'llm' | 'system';
  createdAt: string;
}
```

## 7. LlmCall

Событие вызова LLM нужно для отладки, стоимости и анализа ошибок.

```ts
type LlmCallStatus =
  | 'succeeded'
  | 'failed'
  | 'validation_failed';

interface LlmCall {
  id: string;
  projectId: string;
  sessionId: string;
  userMessageId: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: LlmCallStatus;
  inputHash: string;
  durationMs: number;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  errorCode?: string;
  createdAt: string;
}
```

## 8. AuditEvent

Событие для трассировки значимых действий.

```ts
interface AuditEvent {
  id: string;
  projectId: string;
  sessionId?: string;
  type: string;
  payload: unknown;
  createdAt: string;
}
```

## 9. Правила целостности

- Документация не изменяется напрямую из пользовательского UI.
- Каждое изменение документации должно быть связано с сообщением пользователя или системным событием.
- LLM output применяется только после schema validation.
- Невалидный LLM output не создаёт новую версию документации.
- Перед сохранением новой версии текущий Markdown фиксируется в `DocumentationVersion`.
- Удаление важного содержания должно отражаться в `changeSummary`.
- Ошибка LLM не должна менять `Documentation.markdown`.
