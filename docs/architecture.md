# Архитектура

## 1. Обзор

Silsol строится как web-приложение с отдельным frontend, backend API, PostgreSQL и LLM provider abstraction.

В MVP нет отдельного worker-процесса и фоновой очереди задач. Все изменения документации инициируются сообщением пользователя в чате и обрабатываются через backend API.

```text
Browser
  |
  v
Web App
  |
  v
Backend API
  |------------------|
  v                  v
PostgreSQL       LLM Provider
```

Главный продуктовый поток:

```text
Пользователь -> LLM -> Документация
```

## 2. Основные компоненты

### Web App

Отвечает за:

- project dashboard;
- workspace с чатом и read-only просмотром документации;
- отображение текущей документации;
- отображение краткой истории изменений;
- настройки LLM provider.

Пользователь не получает Markdown-редактор и не меняет документ напрямую.

### Backend API

Отвечает за:

- создание и чтение проектов;
- сохранение сообщений чата;
- чтение текущей документации;
- вызов LLM provider;
- валидацию структурированного ответа LLM;
- сохранение обновлённой документации;
- сохранение версий и audit events.

### PostgreSQL

Используется для:

- проектов;
- сессий чата;
- сообщений;
- текущей документации;
- версий документации;
- LLM call metadata;
- audit events;
- настроек пользователя.

### LLM Provider

LLM подключается через интерфейс `LlmProvider`, чтобы можно было использовать:

- OpenAI-compatible API;
- локальную модель;
- mock provider для разработки и тестов.

## 3. Логические слои backend

```text
Controller
  -> Application Service
  -> Domain Rules
  -> Repository
  -> Database
```

LLM SDK не должен использоваться напрямую в доменных правилах. Он должен быть спрятан за интерфейсом `LlmProvider`.

## 4. Поток изменения документации

```text
User message
  -> API stores user message
  -> API loads current documentation
  -> API calls LLM Provider
  -> LLM returns structured documentation update
  -> API validates LLM output
  -> API stores assistant message
  -> API stores new documentation version
  -> Web App refreshes read-only documentation view
```

Если LLM output не проходит валидацию, текущая документация не изменяется.

## 5. Формат обновления документации

LLM должен возвращать структурированный результат:

```ts
interface DocumentationUpdate {
  assistantMessage: string;
  markdown: string;
  changeSummary: string;
  touchedSections: string[];
  assumptions: string[];
  openQuestions: string[];
}
```

MVP может хранить документ как Markdown-строку. Более сложная структура разделов и артефактов откладывается на следующие этапы.

## 6. Правила изменения документации

- Пользователь меняет документацию только через сообщение в чате.
- Публичный API не предоставляет прямой `PATCH markdown` для пользовательского UI.
- LLM output считается недоверенным до schema validation.
- Невалидный LLM output не применяется.
- Каждое применённое изменение создаёт запись в истории.
- Ошибка LLM не должна повреждать текущую документацию.
- Секреты и системные настройки не попадают в prompt без явной необходимости.

## 7. Рекомендуемый стек

| Слой | Технологии |
| --- | --- |
| Frontend | Vue 3, TypeScript, Vite, Pinia |
| Backend | Node.js, TypeScript, NestJS |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Validation | Zod |
| Tests | Vitest, Playwright для e2e |
| LLM | OpenAI-compatible provider abstraction |

## 8. Нефункциональные требования

- Ошибка LLM не должна повреждать текущий документ.
- Все LLM outputs проходят schema validation.
- Все значимые изменения попадают в audit log.
- UI должен явно показывать, что документ доступен только для просмотра.
- Долгий LLM запрос должен показывать loading state и завершаться понятной ошибкой при timeout.
