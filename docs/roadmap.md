# Roadmap

## Stage 0: Документационная основа

Цель: зафиксировать концепцию упрощённого сервиса, scope MVP, архитектуру и основные правила.

Результат:

- продуктовая спецификация;
- пользовательские сценарии;
- архитектура без worker;
- API draft без background jobs;
- модель данных;
- LLM workflow;
- security и operations notes.

## Stage 1: MVP Chat Documentation Workspace

Цель: создать минимальное приложение для одного пользователя.

Функции:

- project list;
- создание проекта;
- workspace с чатом и read-only документацией;
- начальная генерация документации из идеи;
- изменение документации только через LLM;
- сохранение текущего Markdown;
- простая история изменений;
- mock LLM provider.

## Stage 2: Better Document Control

Цель: сделать изменения документации более управляемыми без прямого редактора.

Функции:

- change summaries;
- preview или diff перед применением изменения;
- undo к предыдущей версии;
- более строгая schema validation;
- разделы `Open questions`, `Assumptions`, `Risks`;
- короткие команды для точечных правок.

## Stage 3: Structured Artifacts

Цель: выделить из документации структурированные элементы.

Функции:

- extraction requirements;
- extraction assumptions;
- extraction open questions;
- artifact confirmation;
- связь артефактов с разделами документа;
- LLM provider settings.

## Stage 4: Review, Approval и Export

Цель: сделать документацию проверяемой и готовой к передаче.

Функции:

- critic chain;
- review report;
- approval rules;
- blocking issues;
- document versions;
- changelog;
- Markdown export;
- JSON export;
- project bundle.

## Stage 5: Worker и Long-running Tasks

Цель: вынести долгие и нестабильные операции из API.

Возможные функции:

- worker process;
- queue для LLM задач;
- retries;
- cancellation;
- progress states;
- отдельный health check worker.

## Stage 6: Collaboration и Integrations

Цель: расширить сервис за пределы single-user MVP.

Возможные функции:

- multi-user projects;
- comments;
- roles;
- GitHub export;
- Notion export;
- Linear/Jira task draft;
- templates marketplace.

## Stage 7: Agent-ready Specifications

Цель: сделать утверждённую документацию входом для агентной разработки.

Возможные функции:

- decomposition into tasks;
- acceptance test generation;
- implementation planning;
- codebase-aware review;
- pull request draft generation.
