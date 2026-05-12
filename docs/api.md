# API

Документ описывает черновой REST API для упрощённого MVP. В MVP пользователь меняет документацию только через чат, поэтому публичный API не предоставляет прямое обновление Markdown.

## 1. Общие соглашения

Базовый путь:

```text
/api
```

Формат данных:

```http
Content-Type: application/json
```

Стандартная ошибка:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {}
  }
}
```

## 2. Projects

### Создать проект

```http
POST /api/projects
```

```json
{
  "name": "AI Documentation App",
  "description": "Web app for writing documentation with LLM"
}
```

Ответ:

```json
{
  "id": "project_123",
  "name": "AI Documentation App",
  "description": "Web app for writing documentation with LLM",
  "status": "active",
  "createdAt": "2026-05-12T10:00:00.000Z",
  "updatedAt": "2026-05-12T10:00:00.000Z"
}
```

### Получить список проектов

```http
GET /api/projects
```

### Получить проект

```http
GET /api/projects/{projectId}
```

## 3. Chat Sessions

### Начать сессию

```http
POST /api/projects/{projectId}/chat-sessions
```

```json
{
  "initialIdea": "I want to build a web app that helps write documentation using LLM."
}
```

Ответ может сразу включать начальную документацию, созданную через LLM или mock provider.

### Получить сессию

```http
GET /api/chat-sessions/{sessionId}
```

## 4. Messages

### Отправить сообщение и обновить документацию

```http
POST /api/chat-sessions/{sessionId}/messages
```

```json
{
  "content": "Add a Non-goals section and mention that direct Markdown editing is out of scope."
}
```

Сервер выполняет полный поток:

1. сохраняет сообщение пользователя;
2. загружает текущую документацию проекта;
3. вызывает LLM provider;
4. валидирует structured output;
5. сохраняет ответ ассистента;
6. сохраняет новую версию документации, если LLM вернула валидное изменение.

Ответ:

```json
{
  "userMessage": {
    "id": "msg_user_123",
    "role": "user",
    "content": "Add a Non-goals section and mention that direct Markdown editing is out of scope.",
    "createdAt": "2026-05-12T10:05:00.000Z"
  },
  "assistantMessage": {
    "id": "msg_assistant_456",
    "role": "assistant",
    "content": "I added the Non-goals section and included direct Markdown editing as out of scope.",
    "createdAt": "2026-05-12T10:05:05.000Z"
  },
  "documentation": {
    "id": "doc_123",
    "projectId": "project_123",
    "title": "Project Specification",
    "markdown": "# Project Specification\n\n...",
    "lastChangeSummary": "Added Non-goals section.",
    "updatedAt": "2026-05-12T10:05:05.000Z"
  },
  "version": {
    "id": "docver_2",
    "version": 2,
    "changeSummary": "Added Non-goals section."
  }
}
```

Если LLM output невалиден:

```json
{
  "error": {
    "code": "LLM_OUTPUT_INVALID",
    "message": "The model response could not be applied safely",
    "details": {
      "documentationChanged": false
    }
  }
}
```

### Получить сообщения

```http
GET /api/chat-sessions/{sessionId}/messages
```

## 5. Documentation

### Получить текущую документацию проекта

```http
GET /api/projects/{projectId}/documentation
```

Ответ:

```json
{
  "id": "doc_123",
  "projectId": "project_123",
  "title": "Project Specification",
  "markdown": "# Project Specification\n\n...",
  "lastChangeSummary": "Added Non-goals section.",
  "updatedAt": "2026-05-12T10:05:05.000Z"
}
```

### Прямое обновление Markdown

Прямой публичный endpoint вида `PATCH /api/documentation/{documentationId}` в MVP не нужен. Документация изменяется только через:

```http
POST /api/chat-sessions/{sessionId}/messages
```

## 6. Documentation Versions

### Получить историю версий

```http
GET /api/projects/{projectId}/documentation/versions
```

### Получить конкретную версию

```http
GET /api/documentation-versions/{versionId}
```

## 7. LLM Settings

### Получить настройки LLM

```http
GET /api/settings/llm
```

API key возвращается только в маскированном виде.

### Обновить настройки LLM

```http
PATCH /api/settings/llm
```

```json
{
  "provider": "openai-compatible",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-5.2",
  "apiKey": "sk-..."
}
```

## 8. Health

### Проверить API

```http
GET /api/health
```

Проверяет:

- процесс API жив;
- соединение с PostgreSQL доступно;
- миграции применены.
