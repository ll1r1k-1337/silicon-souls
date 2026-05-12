# Деплой

## 1. Окружения

MVP может поддерживать три окружения:

| Окружение | Назначение |
| --- | --- |
| local | Разработка на машине разработчика |
| staging | Проверка перед релизом |
| production | Рабочая установка |

## 2. Сервисы

Минимальный runtime:

- web app;
- API;
- PostgreSQL.

В MVP нет отдельного worker-процесса. LLM вызовы выполняются backend API в рамках обработки сообщения чата.

Опционально позже:

- worker и очередь задач для долгих LLM операций;
- Redis для очередей;
- object storage для архивов;
- reverse proxy;
- managed secrets storage.

## 3. Переменные окружения

```text
NODE_ENV=production
DATABASE_URL=postgres://...
APP_BASE_URL=https://silsol.example.com
API_BASE_URL=https://silsol.example.com/api
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-5.2
LLM_API_KEY=...
LLM_REQUEST_TIMEOUT_MS=60000
```

Секреты нельзя хранить в репозитории.

## 4. Local development

Ожидаемый сценарий:

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

Если LLM ключ не задан, приложение должно уметь работать с mock provider.

## 5. Production checklist

- PostgreSQL использует persistent volume или managed database.
- Миграции выполняются до старта API.
- `LLM_API_KEY` задан через secrets manager.
- Включены structured logs.
- Настроены health checks.
- Настроены backup и restore для PostgreSQL.
- Настроен лимит размера пользовательского ввода.
- Настроен timeout для LLM запросов.
- Настроен rate limiting для chat endpoints.

## 6. Health checks

API:

```http
GET /api/health
```

Проверяет:

- процесс API жив;
- соединение с PostgreSQL доступно;
- миграции применены.

Проверка LLM provider может быть отдельной diagnostic action, а не обязательной частью health check, чтобы сбой внешнего provider не делал весь API unhealthy.

## 7. Rollback

Rollback должен учитывать два слоя:

- приложение;
- миграции данных.

Правила:

- destructive migrations требуют отдельного approval;
- перед релизом с миграциями нужен backup;
- старые версии приложения должны быть совместимы с текущей схемой хотя бы на период rollback window;
- новые форматы документации должны иметь backward-compatible migration или безопасный fallback.
