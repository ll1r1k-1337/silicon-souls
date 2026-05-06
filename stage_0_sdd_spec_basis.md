# Technical Specification: Stage 0 — SDD Spec Foundation

## 0. Назначение документа

Этот документ описывает техническую спецификацию стадии 0 проекта SDD / AI Company.

Стадия 0 не реализует полноценную мульти-агентную разработку. Её задача — создать базис для spec-driven-development: систему, которая помогает пользователю совместно с LLM создавать, уточнять, валидировать, версионировать и утверждать продуктовые спецификации.

После завершения стадии 0 система должна уметь принять сырую идею продукта и довести её до состояния `approved specification`, пригодного для последующей декомпозиции на задачи и передачи агентам-исполнителям.

---

# 1. Product Summary

## 1.1. Основная идея

Пользователь выступает как CEO / Product Owner. Он описывает продуктовую идею обычным языком.

Система через LLM помогает:

- извлечь требования;
- задать уточняющие вопросы;
- отделить факты от предположений;
- выявить пробелы и противоречия;
- сформировать структурированную спецификацию;
- провести ревью;
- зафиксировать утверждённую версию спецификации.

## 1.2. Ключевой принцип

```text
Chat is not the source of truth.
Specification is the source of truth.
```

Диалог используется только как механизм получения информации. Все значимые решения, требования, ограничения и предположения должны быть перенесены в структурированные артефакты спецификации.

## 1.3. Результат стадии 0

Главный результат — утверждённая спецификация продукта.

Минимальные артефакты:

```text
/specs/product.md
/specs/requirements.json
/specs/assumptions.json
/specs/open-questions.json
/specs/acceptance-criteria.json
/specs/risks.json
/specs/changelog.md
/specs/spec-meta.json
```

---

# 2. Scope

## 2.1. In Scope

Стадия 0 должна включать:

- создание проекта спецификации;
- интерактивное уточнение идеи;
- генерацию черновика спецификации;
- прямое редактирование спецификации пользователем;
- структурированное хранение требований;
- ведение предположений;
- ведение открытых вопросов;
- генерацию acceptance criteria;
- поиск противоречий и пробелов;
- ревью спецификации;
- версионирование спецификации;
- diff между версиями;
- event sourcing для ключевых изменений доменной модели;
- local-first подход для работы с проектами и спецификациями;
- запуск LLM chains через background jobs;
- хранение Markdown snapshots в PostgreSQL;
- утверждение спецификации пользователем;
- экспорт спецификации в Markdown и JSON.

## 2.2. Out of Scope

Стадия 0 не включает:

- генерацию production-кода;
- выполнение задач агентами;
- полноценную систему найма агентов;
- GitHub-интеграцию;
- CI/CD;
- деплой;
- автономное планирование разработки;
- полноценную task management систему;
- распределение задач между developer-агентами;
- multi-user collaboration;
- Redis/BullMQ;
- удалённую синхронизацию между несколькими устройствами как обязательную функциональность Stage 0.

---

# 3. Core User Flow

## 3.1. Основной сценарий

```text
1. User creates a new SDD project.
2. User submits a raw product idea.
3. System creates initial Spec Session.
4. LLM analyzes the idea.
5. LLM extracts initial facts, assumptions and missing areas.
6. LLM asks clarification questions.
7. User answers.
8. System updates structured spec artifacts.
9. LLM generates draft product specification.
10. LLM runs gap analysis and consistency review.
11. User resolves open questions or accepts assumptions.
12. System produces reviewed specification.
13. User approves specification.
14. System marks specification as ready_for_decomposition.
```

## 3.2. Состояния спецификации

```ts
type SpecStatus =
  | 'raw_idea'
  | 'clarifying'
  | 'draft'
  | 'needs_user_input'
  | 'review'
  | 'approved'
  | 'ready_for_decomposition'
  | 'archived';
```

## 3.3. State Machine

```text
raw_idea
  -> clarifying
  -> draft
  -> needs_user_input
  -> clarifying
  -> draft
  -> review
  -> approved
  -> ready_for_decomposition

review
  -> needs_user_input

approved
  -> draft, if user changes core requirements

ready_for_decomposition
  -> draft, if approved spec is invalidated by change request
```

## 3.4. Approval Rule

Спецификация не может перейти в `approved`, если:

- есть unresolved critical open questions;
- есть unconfirmed high-impact assumptions;
- есть противоречия между требованиями;
- отсутствуют acceptance criteria для core requirements;
- отсутствуют target users или core scenarios;
- отсутствуют явно указанные goals и non-goals.

---

# 4. Domain Model

## 4.1. Entity Overview

```text
Project
  └── SpecSession
        ├── ConversationTurn
        ├── SpecDocument
        ├── Requirement
        ├── Assumption
        ├── OpenQuestion
        ├── AcceptanceCriterion
        ├── Risk
        ├── Decision
        ├── SpecVersion
        └── ReviewReport
```

---

## 4.2. Project

```ts
interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  currentSpecSessionId?: string;
}

type ProjectStatus =
  | 'created'
  | 'specification_in_progress'
  | 'specification_approved'
  | 'ready_for_decomposition'
  | 'archived';
```

---

## 4.3. SpecSession

```ts
interface SpecSession {
  id: string;
  projectId: string;
  status: SpecStatus;
  rawIdea: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: 'user';
}
```

---

## 4.4. ConversationTurn

```ts
interface ConversationTurn {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  extractedFactIds: string[];
  extractedRequirementIds: string[];
  extractedAssumptionIds: string[];
  extractedDecisionIds: string[];
}
```

Назначение:

- хранить историю взаимодействия;
- связывать фрагменты диалога со структурированными артефактами;
- позволять трассировать происхождение требований.

---

## 4.5. Requirement

```ts
type RequirementType =
  | 'functional'
  | 'non_functional'
  | 'business'
  | 'technical'
  | 'ux'
  | 'security'
  | 'data'
  | 'integration';

type RequirementPriority = 'must' | 'should' | 'could' | 'wont';

type RequirementStatus =
  | 'draft'
  | 'confirmed'
  | 'rejected'
  | 'changed'
  | 'deprecated';

interface Requirement {
  id: string;
  sessionId: string;
  type: RequirementType;
  title: string;
  description: string;
  priority: RequirementPriority;
  status: RequirementStatus;
  source: ArtifactSource;
  sourceTurnIds: string[];
  rationale?: string;
  dependencies: string[];
  conflictsWith: string[];
  acceptanceCriteriaIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

## 4.6. ArtifactSource

```ts
type ArtifactSourceType =
  | 'user_explicit'
  | 'user_implicit'
  | 'llm_inferred'
  | 'llm_suggested'
  | 'system_generated';

interface ArtifactSource {
  type: ArtifactSourceType;
  confidence: number;
  requiresUserConfirmation: boolean;
}
```

Правило:

```text
Все артефакты с source.type = llm_inferred или llm_suggested
должны требовать подтверждения пользователя, если они влияют на scope продукта.
```

---

## 4.7. Assumption

```ts
type AssumptionImpact = 'low' | 'medium' | 'high' | 'critical';

type AssumptionStatus =
  | 'unconfirmed'
  | 'confirmed'
  | 'rejected'
  | 'replaced';

interface Assumption {
  id: string;
  sessionId: string;
  text: string;
  impact: AssumptionImpact;
  status: AssumptionStatus;
  reason: string;
  source: ArtifactSource;
  relatedRequirementIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

## 4.8. OpenQuestion

```ts
type OpenQuestionSeverity = 'minor' | 'normal' | 'important' | 'blocking';

type OpenQuestionStatus =
  | 'open'
  | 'answered'
  | 'converted_to_assumption'
  | 'dismissed';

interface OpenQuestion {
  id: string;
  sessionId: string;
  question: string;
  whyItMatters: string;
  severity: OpenQuestionSeverity;
  status: OpenQuestionStatus;
  suggestedAnswers?: string[];
  answer?: string;
  relatedRequirementIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

## 4.9. AcceptanceCriterion

```ts
type AcceptanceCriterionStatus =
  | 'draft'
  | 'confirmed'
  | 'rejected'
  | 'deprecated';

interface AcceptanceCriterion {
  id: string;
  sessionId: string;
  requirementId: string;
  title: string;
  description: string;
  verificationMethod: 'manual' | 'automated' | 'review' | 'test' | 'inspection';
  status: AcceptanceCriterionStatus;
  createdAt: string;
  updatedAt: string;
}
```

---

## 4.10. Risk

```ts
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

type RiskStatus =
  | 'identified'
  | 'accepted'
  | 'mitigated'
  | 'dismissed';

interface Risk {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  level: RiskLevel;
  mitigation?: string;
  status: RiskStatus;
  relatedRequirementIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

## 4.11. Decision

```ts
interface Decision {
  id: string;
  sessionId: string;
  title: string;
  context: string;
  decision: string;
  alternatives: string[];
  rationale: string;
  sourceTurnIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

## 4.12. SpecVersion

```ts
interface SpecVersion {
  id: string;
  sessionId: string;
  version: string;
  status: SpecStatus;
  markdownSnapshot: string;
  jsonSnapshot: ProductSpecJson;
  changeSummary: string;
  createdAt: string;
  createdBy: 'user' | 'assistant' | 'system';
}
```

Версионирование:

```text
0.1.0 — первый черновик
0.2.0 — значимое изменение структуры или требований
0.2.1 — мелкая правка текста
1.0.0 — первая утверждённая спецификация
1.1.0 — изменение scope после утверждения
```

---

# 5. Product Specification Schema

## 5.1. ProductSpecJson

```ts
interface ProductSpecJson {
  meta: SpecMeta;
  product: ProductSection;
  problem: ProblemSection;
  users: TargetUser[];
  goals: Goal[];
  nonGoals: NonGoal[];
  scenarios: UserScenario[];
  requirements: Requirement[];
  assumptions: Assumption[];
  openQuestions: OpenQuestion[];
  acceptanceCriteria: AcceptanceCriterion[];
  risks: Risk[];
  decisions: Decision[];
}
```

---

## 5.2. SpecMeta

```ts
interface SpecMeta {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  version: string;
  status: SpecStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}
```

---

## 5.3. ProductSection

```ts
interface ProductSection {
  name: string;
  summary: string;
  elevatorPitch?: string;
}
```

---

## 5.4. ProblemSection

```ts
interface ProblemSection {
  description: string;
  currentAlternatives?: string[];
  painPoints: string[];
}
```

---

## 5.5. TargetUser

```ts
interface TargetUser {
  id: string;
  name: string;
  description: string;
  needs: string[];
  constraints: string[];
}
```

---

## 5.6. Goal / NonGoal

```ts
interface Goal {
  id: string;
  description: string;
  successMetric?: string;
}

interface NonGoal {
  id: string;
  description: string;
  rationale?: string;
}
```

---

## 5.7. UserScenario

```ts
type ScenarioPriority = 'primary' | 'secondary' | 'edge_case';

interface UserScenario {
  id: string;
  title: string;
  actor: string;
  goal: string;
  preconditions: string[];
  steps: string[];
  expectedOutcome: string;
  priority: ScenarioPriority;
  relatedRequirementIds: string[];
}
```

---

# 6. LLM Roles for Stage 0

На стадии 0 не требуется полноценная система агентов, но требуется несколько режимов поведения LLM.

## 6.1. Interviewer

Цель: получить недостающую информацию от пользователя.

Вход:

```ts
interface InterviewerInput {
  rawIdea: string;
  currentSpec?: ProductSpecJson;
  openQuestions: OpenQuestion[];
  assumptions: Assumption[];
}
```

Выход:

```ts
interface InterviewerOutput {
  questions: Array<{
    question: string;
    whyItMatters: string;
    severity: OpenQuestionSeverity;
    suggestedAnswers?: string[];
  }>;
}
```

Правила:

- задавать не больше 5 вопросов за один шаг;
- сначала спрашивать blocking/important вопросы;
- не спрашивать то, что уже явно указано пользователем;
- если можно сделать безопасное low-impact предположение, пометить его как assumption вместо вопроса.

---

## 6.2. Extractor

Цель: извлекать структурированные артефакты из сообщений пользователя.

Вход:

```ts
interface ExtractorInput {
  sessionId: string;
  userMessage: string;
  conversationContext: ConversationTurn[];
  currentSpec?: ProductSpecJson;
}
```

Выход:

```ts
interface ExtractorOutput {
  requirements: Requirement[];
  assumptions: Assumption[];
  decisions: Decision[];
  openQuestions: OpenQuestion[];
  risks: Risk[];
}
```

Правила:

- не перезаписывать существующие требования без change record;
- помечать источник каждого артефакта;
- отличать явные утверждения пользователя от выводов LLM;
- не превращать каждую фразу в требование.

---

## 6.3. Spec Writer

Цель: собрать Markdown-спецификацию из структурированных данных.

Вход:

```ts
interface SpecWriterInput {
  spec: ProductSpecJson;
  targetFormat: 'markdown';
}
```

Выход:

```ts
interface SpecWriterOutput {
  markdown: string;
  sections: Array<{
    title: string;
    completeness: number;
    notes: string[];
  }>;
}
```

Правила:

- не добавлять новые требования без явной маркировки как assumption;
- не скрывать open questions;
- явно отображать non-goals;
- явно отображать acceptance criteria.

---

## 6.4. Critic

Цель: найти проблемы в спецификации.

Вход:

```ts
interface CriticInput {
  spec: ProductSpecJson;
}
```

Выход:

```ts
interface CriticOutput {
  gaps: SpecGap[];
  contradictions: SpecContradiction[];
  risks: Risk[];
  suggestedQuestions: OpenQuestion[];
}
```

```ts
interface SpecGap {
  id: string;
  section: string;
  description: string;
  severity: 'minor' | 'normal' | 'important' | 'blocking';
  recommendation: string;
}

interface SpecContradiction {
  id: string;
  description: string;
  relatedRequirementIds: string[];
  severity: 'minor' | 'normal' | 'important' | 'blocking';
  recommendation: string;
}
```

Правила:

- не исправлять молча;
- критические проблемы должны блокировать approval;
- рекомендации должны быть actionable.

---

## 6.5. Reviewer

Цель: подготовить спецификацию к утверждению.

Вход:

```ts
interface ReviewerInput {
  spec: ProductSpecJson;
  criticOutput: CriticOutput;
}
```

Выход:

```ts
interface ReviewerOutput {
  canApprove: boolean;
  blockingIssues: string[];
  recommendedChanges: string[];
  approvalSummary: string;
}
```

---

## 6.6. Change Manager

Цель: управлять изменениями после создания черновика или утверждения.

Вход:

```ts
interface ChangeManagerInput {
  changeRequest: string;
  currentSpec: ProductSpecJson;
  currentVersion: SpecVersion;
}
```

Выход:

```ts
interface ChangeManagerOutput {
  updatedSpec: ProductSpecJson;
  changeSet: SpecChange[];
  requiresReapproval: boolean;
  summary: string;
}
```

```ts
interface SpecChange {
  id: string;
  type: 'added' | 'modified' | 'removed' | 'deprecated';
  entityType:
    | 'requirement'
    | 'assumption'
    | 'open_question'
    | 'acceptance_criterion'
    | 'risk'
    | 'decision'
    | 'scenario'
    | 'goal'
    | 'non_goal';
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason: string;
}
```

---

# 7. System Architecture

## 7.1. High-Level Architecture

```text
Vue Client UI
  ├── Local-first State Layer
  ├── Local Draft Cache
  └── API Client
        ↓
NestJS API Layer
  ↓
Application Services
  ├── ProjectService
  ├── SpecSessionService
  ├── ConversationService
  ├── SpecDocumentService
  ├── ArtifactExtractionService
  ├── SpecGenerationService
  ├── SpecReviewService
  ├── SpecVersioningService
  ├── EventStoreService
  ├── BackgroundJobService
  └── ExportService
        ↓
Background Job Processor
  ├── Interviewer Job
  ├── Extractor Job
  ├── Spec Writer Job
  ├── Critic Job
  ├── Reviewer Job
  └── Change Manager Job
        ↓
LLM Orchestration Layer
  ├── LangChain.js
  ├── Provider Adapter
  ├── Prompt Registry
  └── Structured Output Validation
        ↓
Persistence Layer
  ├── PostgreSQL
  ├── Event Store
  ├── Markdown Snapshots
  ├── JSONB Artifacts
  └── DB-backed Job Queue
```

## 7.2. Backend Modules

```text
src/
  modules/
    projects/
    spec-sessions/
    conversations/
    spec-documents/
    spec-artifacts/
    spec-generation/
    spec-review/
    spec-versioning/
    event-store/
    background-jobs/
    llm/
    exports/
  shared/
    domain/
    validation/
    errors/
    events/
```

## 7.3. Core Services

### ProjectService

Ответственность:

- создать проект;
- получить проект;
- связать проект с текущей spec session;
- обновить статус проекта.

### SpecSessionService

Ответственность:

- создать spec session;
- изменить статус session;
- получить текущую session;
- проверить возможность approval.

### ConversationService

Ответственность:

- сохранить сообщения пользователя и ассистента;
- связать сообщения с извлечёнными артефактами;
- отдавать контекст для LLM.

### ArtifactExtractionService

Ответственность:

- запускать Extractor;
- валидировать структурированный output;
- сохранять requirements, assumptions, decisions, risks и questions.

### SpecGenerationService

Ответственность:

- собрать `ProductSpecJson`;
- вызвать Spec Writer;
- сохранить Markdown snapshot.

### SpecReviewService

Ответственность:

- запускать Critic;
- запускать Reviewer;
- формировать ReviewReport;
- блокировать approval при критических проблемах.

### SpecVersioningService

Ответственность:

- создавать версии;
- считать diff;
- хранить changelog;
- откатывать версию, если потребуется.

### ExportService

Ответственность:

- экспортировать Markdown;
- экспортировать JSON;
- подготовить bundle для следующей стадии.

---

## 7.4. Event Sourcing

Stage 0 использует event sourcing сразу, а не добавляет его позже.

Назначение:

- сохранять историю изменений спецификации;
- восстанавливать состояние проекта и spec session из событий;
- иметь полный audit trail;
- поддерживать diff, changelog и отладку LLM-driven изменений;
- сделать прямое редактирование спецификации безопасным и трассируемым.

Правило:

```text
Каждое значимое изменение состояния должно быть записано как доменное событие.
```

Состояние read models может храниться в обычных таблицах PostgreSQL, но source of truth для изменений — event store.

Минимальные события Stage 0:

```text
project.created
spec_session.started
conversation.message_added
spec_document.created
spec_document.directly_edited
spec_artifacts.extracted
spec_artifact.confirmed
spec_artifact.rejected
spec_draft.generated
spec_review.completed
spec_version.created
spec.approved
spec.exported
llm_job.created
llm_job.completed
llm_job.failed
```

## 7.5. Local-first Architecture

Stage 0 разрабатывается в local-first парадигме.

Для Stage 0 это означает:

```text
- приложение должно быть удобно использовать локально;
- PostgreSQL является основной локальной БД;
- UI должен сохранять локальные draft-состояния редактора;
- пользователь не должен терять незавершённые правки при перезагрузке страницы;
- backend и database должны запускаться локально через Docker Compose;
- single-user режим является базовым и единственным обязательным режимом Stage 0.
```

Local-first на Stage 0 не означает обязательную multi-device синхронизацию. Это можно добавить позже.

Минимальная frontend local persistence:

```text
IndexedDB or localStorage for editor draft cache
Pinia store hydration from local cache
dirty state tracking
manual save
autosave, optional
```

## 7.6. Background Jobs

LLM chains должны запускаться через background jobs, а не синхронно внутри API request.

Так как Redis/BullMQ отложены до Stage 1, Stage 0 использует DB-backed job queue в PostgreSQL.

Правило:

```text
API creates a job and immediately returns jobId.
Worker process picks the job, executes LangChain chain and writes result to PostgreSQL.
```

Минимальные job types:

```text
extract_artifacts
generate_clarifying_questions
generate_draft
run_critic
run_reviewer
apply_change_request
export_bundle
```

Job statuses:

```ts
type BackgroundJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

Stage 1 может заменить DB-backed queue на Redis/BullMQ без изменения application contracts.

---

# 8. API Specification

## 8.1. Create Project

```http
POST /api/projects
```

Request:

```json
{
  "name": "Personal Finance App",
  "description": "App for tracking income, expenses and debts"
}
```

Response:

```json
{
  "projectId": "prj_123",
  "status": "created"
}
```

---

## 8.2. Start Spec Session

```http
POST /api/projects/:projectId/spec-sessions
```

Request:

```json
{
  "rawIdea": "I want an app for personal finance tracking"
}
```

Response:

```json
{
  "sessionId": "spec_123",
  "status": "raw_idea"
}
```

---

## 8.3. Send User Message

```http
POST /api/spec-sessions/:sessionId/messages
```

Request:

```json
{
  "message": "MVP should support expenses, income and monthly balance"
}
```

Response:

```json
{
  "messageId": "msg_123",
  "jobs": [
    {
      "jobId": "job_extract_123",
      "type": "extract_artifacts",
      "status": "queued"
    },
    {
      "jobId": "job_questions_123",
      "type": "generate_clarifying_questions",
      "status": "queued"
    }
  ],
  "status": "clarifying"
}
```

Правило:

```text
Сообщение сохраняется синхронно, а LLM processing выполняется через background jobs.
```

---

## 8.4. Generate Draft Spec

```http
POST /api/spec-sessions/:sessionId/generate-draft
```

Response:

```json
{
  "jobId": "job_draft_123",
  "type": "generate_draft",
  "status": "queued"
}
```

После завершения job система создаёт draft version и сохраняет Markdown snapshot в PostgreSQL.

---

## 8.5. Run Spec Review

```http
POST /api/spec-sessions/:sessionId/review
```

Response:

```json
{
  "jobId": "job_review_123",
  "type": "run_review",
  "status": "queued"
}
```

После завершения job система сохраняет ReviewReport и обновляет review state.

---

## 8.6. Approve Spec

```http
POST /api/spec-sessions/:sessionId/approve
```

Response:

```json
{
  "status": "approved",
  "version": "1.0.0",
  "approvedAt": "2026-05-05T12:00:00.000Z"
}
```

Validation:

- вызывает Reviewer;
- если `canApprove = false`, возвращает `409 Conflict`;
- если approval успешен, создаёт version `1.0.0`.

---

## 8.7. Export Spec

```http
GET /api/spec-sessions/:sessionId/export?format=markdown
GET /api/spec-sessions/:sessionId/export?format=json
GET /api/spec-sessions/:sessionId/export?format=bundle
```

Bundle format:

```text
product.md
requirements.json
assumptions.json
open-questions.json
acceptance-criteria.json
risks.json
changelog.md
spec-meta.json
```

---

## 8.8. Update Spec Document Directly

```http
PATCH /api/spec-sessions/:sessionId/document
```

Request:

```json
{
  "markdown": "# Product Specification
...",
  "baseVersionId": "ver_001",
  "changeSummary": "Updated goals and MVP scope"
}
```

Response:

```json
{
  "documentId": "doc_123",
  "status": "draft",
  "versionId": "ver_002",
  "eventId": "evt_123"
}
```

Правила:

```text
- прямое редактирование создаёт событие spec_document.directly_edited;
- изменение approved specification переводит её обратно в draft или требует reapproval;
- после прямого редактирования может быть запущен background job для повторного извлечения артефактов.
```

---

## 8.9. Get Background Job Status

```http
GET /api/jobs/:jobId
```

Response:

```json
{
  "jobId": "job_review_123",
  "type": "run_review",
  "status": "completed",
  "resultRef": {
    "type": "review_report",
    "id": "review_123"
  }
}
```

---

# 9. Persistence

## 9.1. Database Choice

Stage 0 использует PostgreSQL как основную локальную БД.

PostgreSQL используется для:

- event store;
- read models;
- structured spec artifacts через JSONB;
- Markdown snapshots;
- conversation history;
- review reports;
- DB-backed background jobs;
- local-first persistence;
- возможности later добавить pgvector.

Решение:

```text
Markdown snapshots are stored in PostgreSQL.
Object storage is not required for Stage 0.
```

---

## 9.2. Tables

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  current_spec_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE spec_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL,
  raw_idea TEXT NOT NULL,
  current_version_id TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE conversation_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE spec_artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  artifact_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  source JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE spec_versions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  markdown_snapshot TEXT NOT NULL,
  json_snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE review_reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  version_id TEXT REFERENCES spec_versions(id),
  can_approve BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE event_store (
  id TEXT PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_event_store_aggregate
  ON event_store (aggregate_id, aggregate_type, created_at);

CREATE TABLE spec_documents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  current_version_id TEXT,
  markdown TEXT NOT NULL,
  dirty BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE background_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  result JSONB,
  error JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  run_after TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

---

## 9.3. spec_artifacts Usage

`spec_artifacts` хранит разные типы артефактов в одном формате.

`artifact_type` может быть:

```text
requirement
assumption
open_question
acceptance_criterion
risk
decision
goal
non_goal
scenario
target_user
```

Плюс такого подхода для стадии 0:

- проще менять схему;
- проще хранить разные типы артефактов;
- проще делать generic diff;
- проще строить UI вокруг списка артефактов.

Минус:

- меньше статической строгости на уровне БД.

Компенсация:

- runtime validation через Zod;
- типизация на уровне TypeScript;
- миграции схемы артефактов.

---

# 10. Validation

## 10.1. Runtime Validation

Все LLM outputs должны проходить runtime validation.

Рекомендуемый инструмент:

```text
Zod
```

Пример:

```ts
const RequirementSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.enum([
    'functional',
    'non_functional',
    'business',
    'technical',
    'ux',
    'security',
    'data',
    'integration',
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['must', 'should', 'could', 'wont']),
  status: z.enum(['draft', 'confirmed', 'rejected', 'changed', 'deprecated']),
  source: ArtifactSourceSchema,
  sourceTurnIds: z.array(z.string()),
  dependencies: z.array(z.string()),
  conflictsWith: z.array(z.string()),
  acceptanceCriteriaIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

## 10.2. LLM Output Rule

LLM никогда не должна напрямую писать в БД.

Правильный поток:

```text
LLM raw output
  ↓
JSON parse
  ↓
Zod validation
  ↓
Domain validation
  ↓
Application service
  ↓
Database transaction
```

## 10.3. Domain Validation

Перед approval нужно проверить:

```ts
interface ApprovalValidationResult {
  canApprove: boolean;
  errors: string[];
  warnings: string[];
}
```

Обязательные проверки:

- есть product summary;
- есть problem statement;
- есть хотя бы один target user;
- есть хотя бы одна goal;
- есть хотя бы одна non-goal;
- есть core user scenarios;
- есть functional requirements;
- у core requirements есть acceptance criteria;
- нет blocking open questions;
- нет critical unconfirmed assumptions;
- нет unresolved contradictions.

---

# 11. LLM Integration and Orchestration

Stage 0 использует LangChain.js как основной слой взаимодействия с LLM.

LangChain.js не должен становиться частью доменной модели. Он используется внутри infrastructure/application слоя как orchestration toolkit для prompt templates, model adapters, structured output, retries, tracing и composition chains.

## 11.1. Цели LLM-интеграции

LLM-интеграция должна решать следующие задачи:

```text
- единый способ вызова разных LLM-провайдеров;
- структурированные ответы по Zod-схемам;
- переиспользуемые prompt templates;
- трассировка и отладка LLM-вызовов;
- retry / repair при невалидном output;
- streaming для UI, где это уместно;
- изоляция application services от конкретного provider SDK;
- возможность later заменить provider без переписывания Stage 0.
```

## 11.2. Chosen LLM Framework

```text
LLM Framework: LangChain.js
Language: TypeScript
Runtime: Node.js
Primary Usage: chains, prompt templates, structured output, tracing
Optional Later: LangGraph.js for complex agent workflows
```

Для Stage 0 не требуется строить полноценные agents через LangChain agents. Основной паттерн — deterministic chains вокруг конкретных задач:

```text
Interviewer Chain
Extractor Chain
Spec Writer Chain
Critic Chain
Reviewer Chain
Change Manager Chain
```

LangGraph.js можно рассмотреть позже, когда появятся сложные stateful workflows, human-in-the-loop сценарии и настоящая мульти-агентная координация.

## 11.3. Required Packages

Минимальный набор пакетов:

```text
langchain
@langchain/core
zod
```

Пакеты провайдеров добавляются отдельно:

```text
@langchain/openai
@langchain/anthropic
@langchain/google-genai
```

Для Stage 0 нужно поддержать хотя бы одного провайдера через adapter. Остальные провайдеры должны подключаться без изменения доменной логики.

## 11.4. NestJS LLM Module

LLM-интеграция должна быть оформлена как отдельный NestJS module.

```text
apps/api/src/modules/llm/
  llm.module.ts
  llm.service.ts
  llm-provider.factory.ts
  llm-chain-runner.service.ts
  llm-output-repair.service.ts
  llm-tracing.service.ts
  chains/
    interviewer.chain.ts
    extractor.chain.ts
    spec-writer.chain.ts
    critic.chain.ts
    reviewer.chain.ts
    change-manager.chain.ts
  prompts/
    interviewer.prompt.ts
    extractor.prompt.ts
    spec-writer.prompt.ts
    critic.prompt.ts
    reviewer.prompt.ts
    change-manager.prompt.ts
```

## 11.5. Configuration

LLM settings должны задаваться через environment variables и NestJS ConfigModule.

```text
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.2
LLM_TEMPERATURE=0.2
LLM_MAX_RETRIES=2
LLM_TIMEOUT_MS=30000
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=sdd-stage-0
```

Конфигурация должна поддерживать разные модели для разных chains.

Пример:

```text
LLM_MODEL_EXTRACTOR=gpt-5.2
LLM_MODEL_SPEC_WRITER=gpt-5.2
LLM_MODEL_CRITIC=gpt-5.2
LLM_MODEL_REVIEWER=gpt-5.2
```

## 11.6. Provider Abstraction

Application services не должны напрямую использовать `ChatOpenAI`, `ChatAnthropic` или другие provider-specific классы.

Вместо этого используется internal abstraction:

```ts
interface LlmProvider {
  invoke(messages: LlmMessage[], options?: LlmInvokeOptions): Promise<LlmTextResult>;

  invokeStructured<Input, Output>(params: {
    chainName: string;
    input: Input;
    messages: LlmMessage[];
    outputSchema: z.ZodSchema<Output>;
    options?: LlmInvokeOptions;
  }): Promise<Output>;
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmInvokeOptions {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

interface LlmTextResult {
  content: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}
```

## 11.7. LangChain Provider Implementation

LangChain.js используется внутри конкретной реализации provider adapter.

Пример реализации для OpenAI-провайдера:

```ts
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

export class LangChainOpenAiProvider implements LlmProvider {
  private readonly model: ChatOpenAI;

  constructor(config: LlmConfig) {
    this.model = new ChatOpenAI({
      model: config.model,
      temperature: config.temperature,
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
  }

  async invoke(messages: LlmMessage[], options?: LlmInvokeOptions): Promise<LlmTextResult> {
    const response = await this.model.invoke(messages, {
      metadata: options?.metadata,
      runName: options?.traceId,
    });

    return {
      content: String(response.content),
      raw: response,
    };
  }

  async invokeStructured<Input, Output>(params: {
    chainName: string;
    input: Input;
    messages: LlmMessage[];
    outputSchema: z.ZodSchema<Output>;
    options?: LlmInvokeOptions;
  }): Promise<Output> {
    const structuredModel = this.model.withStructuredOutput(params.outputSchema, {
      name: params.chainName,
    });

    return structuredModel.invoke(params.messages, {
      metadata: {
        chainName: params.chainName,
        ...params.options?.metadata,
      },
      runName: params.options?.traceId,
    });
  }
}
```

## 11.8. Общий контракт LLM Chain

Каждая chain должна иметь явный input schema, output schema и prompt factory.

```ts
interface LlmChain<Input, Output> {
  name: string;
  inputSchema: z.ZodSchema<Input>;
  outputSchema: z.ZodSchema<Output>;
  buildMessages(input: Input): LlmMessage[];
  run(input: Input, context: LlmRequestContext): Promise<Output>;
}
```

Базовая реализация:

```ts
abstract class BaseLlmChain<Input, Output> implements LlmChain<Input, Output> {
  abstract name: string;
  abstract inputSchema: z.ZodSchema<Input>;
  abstract outputSchema: z.ZodSchema<Output>;

  constructor(protected readonly chainRunner: LlmChainRunner) {}

  abstract buildMessages(input: Input): LlmMessage[];

  async run(input: Input, context: LlmRequestContext): Promise<Output> {
    const validInput = this.inputSchema.parse(input);

    return this.chainRunner.runStructured({
      chainName: this.name,
      input: validInput,
      messages: this.buildMessages(validInput),
      outputSchema: this.outputSchema,
      context,
    });
  }
}
```

## 11.9. LLM Request Context

```ts
interface LlmRequestContext {
  projectId: string;
  sessionId: string;
  userId?: string;
  chainName: string;
  traceId: string;
  sourceTurnId?: string;
  versionId?: string;
}
```

Контекст используется для:

```text
- trace logging;
- audit trail;
- связывания LLM output с conversation turn;
- последующего анализа качества chain;
- debugging через LangSmith или внутренние логи.
```

## 11.10. Prompt Templates

Prompt templates должны храниться отдельно от business logic.

Каждый prompt должен состоять из:

```text
1. Role
2. Objective
3. Input data
4. Rules
5. Output schema expectations
6. Examples, optional
```

Пример prompt factory:

```ts
import { ChatPromptTemplate } from '@langchain/core/prompts';

export const extractorPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You extract structured specification artifacts from user messages.
You must distinguish explicit user statements from inferred assumptions.
You must not invent requirements.
You must return output matching the provided schema.`
  ],
  [
    'user',
    `Current specification:
{currentSpec}

Conversation context:
{conversationContext}

User message:
{userMessage}`
  ],
]);
```

Правила prompt management:

```text
- каждый prompt имеет имя и версию;
- изменение prompt version должно попадать в audit logs;
- prompts не должны содержать provider-specific logic;
- prompts должны быть тестируемыми через fixtures.
```

## 11.11. Structured Output Strategy

Для Stage 0 основной формат взаимодействия с LLM — structured output.

Правило:

```text
If the output is persisted or affects specification state, it must be structured and validated.
```

Неструктурированный текст допустим только для:

```text
- human-readable assistant messages;
- short explanations;
- UI-friendly summaries;
- non-persistent helper responses.
```

Структурированный output должен проходить:

```text
LangChain structured output
  ↓
Zod validation
  ↓
Domain validation
  ↓
Deduplication
  ↓
Persistence transaction
```

## 11.12. Chain Runner

`LlmChainRunner` — центральный сервис запуска chains.

```ts
interface RunStructuredParams<Input, Output> {
  chainName: string;
  input: Input;
  messages: LlmMessage[];
  outputSchema: z.ZodSchema<Output>;
  context: LlmRequestContext;
  options?: LlmInvokeOptions;
}

class LlmChainRunner {
  constructor(
    private readonly provider: LlmProvider,
    private readonly repairService: LlmOutputRepairService,
    private readonly tracingService: LlmTracingService,
  ) {}

  async runStructured<Input, Output>(
    params: RunStructuredParams<Input, Output>,
  ): Promise<Output> {
    try {
      const output = await this.provider.invokeStructured(params);
      return params.outputSchema.parse(output);
    } catch (error) {
      return this.repairService.repairStructuredOutput(params, error);
    }
  }
}
```

## 11.13. Retry and Repair Strategy

Типовые ошибки:

```ts
type LlmErrorCode =
  | 'invalid_json'
  | 'schema_validation_failed'
  | 'empty_response'
  | 'provider_error'
  | 'timeout'
  | 'unsafe_output'
  | 'low_confidence_output';
```

Поведение:

```text
invalid_json -> one repair attempt
schema_validation_failed -> one repair attempt with validation errors
provider_error -> retry according to provider policy
timeout -> return recoverable error
unsafe_output -> reject output and create review warning
low_confidence_output -> save as draft suggestion, not confirmed artifact
```

Repair prompt должен получать:

```text
- original chain name;
- original input summary;
- invalid output;
- validation errors;
- expected schema description.
```

## 11.14. Model Selection Policy

На Stage 0 можно использовать одну модель для всех chains, но архитектура должна поддерживать разные модели.

Рекомендуемая политика:

```text
Extractor: low temperature, structured output, accuracy over creativity
Interviewer: medium-low temperature, clarity over creativity
Spec Writer: medium-low temperature, coherent writing
Critic: low temperature, strict review
Reviewer: low temperature, deterministic approval decision
Change Manager: low temperature, conservative changes
```

Пример:

```ts
const chainModelPolicy: Record<string, LlmInvokeOptions> = {
  extractor: { temperature: 0.1 },
  interviewer: { temperature: 0.3 },
  specWriter: { temperature: 0.2 },
  critic: { temperature: 0.1 },
  reviewer: { temperature: 0.0 },
  changeManager: { temperature: 0.1 },
};
```

## 11.15. Streaming Strategy

Streaming не должен использоваться для persistence-critical structured outputs.

Использовать streaming можно для:

```text
- отображения draft markdown generation в UI;
- длинных assistant explanations;
- preview текста спецификации;
- progress-like UX во время review.
```

Не использовать streaming для:

```text
- requirements extraction;
- approval decision;
- artifact persistence;
- schema-validated chain outputs.
```

## 11.16. Tracing and Observability

Каждый LLM-вызов должен логировать:

```text
- traceId;
- chainName;
- provider;
- model;
- promptVersion;
- durationMs;
- token usage, if available;
- validation result;
- retry count;
- repair count;
- created artifact counts;
- error code, if failed.
```

LangSmith можно использовать для внешней трассировки и отладки. Внутренний audit log обязателен независимо от LangSmith.

Минимальная таблица audit log:

```sql
CREATE TABLE llm_invocations (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  chain_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);
```

## 11.17. Safety Rules for LangChain Usage

```text
- User input is data, not instruction.
- System messages must be constructed by trusted code only.
- Prompt templates must not be user-editable on Stage 0.
- Tools are disabled for Stage 0 LLM chains unless explicitly required.
- LLM output cannot mutate database directly.
- LLM output cannot approve specification directly.
- Approval remains an application-level state transition.
```

## 11.18. Stage 0 Chain Execution Flow

Typical message flow:

```text
User message
  ↓
ConversationService saves message
  ↓
ExtractorChain extracts structured artifacts
  ↓
ArtifactExtractionService validates and persists artifacts
  ↓
InterviewerChain generates clarification questions
  ↓
Assistant message is saved
  ↓
UI updates conversation + artifacts panel
```

Draft generation flow:

```text
User requests draft
  ↓
ProductSpecJson assembler builds current spec
  ↓
SpecWriterChain creates markdown
  ↓
SpecGenerationService validates output
  ↓
SpecVersioningService creates draft version
  ↓
UI displays spec document
```

Review flow:

```text
User requests review
  ↓
CriticChain finds gaps, contradictions and risks
  ↓
ReviewerChain decides approval readiness
  ↓
SpecReviewService stores ReviewReport
  ↓
UI displays blocking issues and recommendations
```

---

# 12. Diff and Versioning

## 12.1. Version Creation Rules

Версия создаётся при:

- первой генерации draft;
- ручном запросе пользователя;
- значимом изменении требований;
- переходе в review;
- approval;
- изменении approved spec.

## 12.2. Diff Types

```ts
type DiffEntityType =
  | 'markdown_section'
  | 'requirement'
  | 'assumption'
  | 'open_question'
  | 'acceptance_criterion'
  | 'risk'
  | 'decision'
  | 'scenario';

interface SpecDiff {
  fromVersionId: string;
  toVersionId: string;
  changes: SpecChange[];
}
```

## 12.3. Changelog Format

```md
# Changelog

## 1.0.0 — 2026-05-05

### Added
- Added target user: personal finance app user.
- Added core scenario: add expense.

### Changed
- Changed MVP scope to exclude multi-user accounts.

### Removed
- Removed bank integration from MVP.

### Open Questions
- Should recurring payments be supported in MVP?
```

---

# 13. Commands

## 13.1. Required Commands

```text
/start-spec
/clarify
/generate-draft
/find-gaps
/list-requirements
/list-assumptions
/list-open-questions
/list-risks
/review-spec
/approve-spec
/change-requirement
/show-diff
/export-spec
```

## 13.2. Command Behavior

### /start-spec

Creates new SpecSession from raw idea.

### /clarify

Runs Interviewer chain and returns prioritized questions.

### /generate-draft

Runs Spec Writer and creates draft version.

### /find-gaps

Runs Critic and returns gaps, contradictions and missing information.

### /review-spec

Runs Critic + Reviewer.

### /approve-spec

Runs approval validation. If successful, creates version `1.0.0`.

### /change-requirement

Runs Change Manager and updates affected artifacts.

### /show-diff

Shows diff between current version and selected previous version.

### /export-spec

Exports markdown/json/bundle.

---

# 14. UI/UX Requirements

## 14.1. Product UI Principle

Интерфейс Stage 0 должен быть минималистичным, тёмным и сфокусированным на создании спецификации.

Главный принцип:

```text
Specification is the primary workspace.
Chat is a helper, not the product center.
```

UI не должен ощущаться как обычный чат с LLM. Чат — это инструмент уточнения. Основной объект интерфейса — спецификация и связанные с ней структурированные артефакты.

## 14.2. Visual Style

Базовый стиль Stage 0:

```text
Style: minimalistic
Default Theme: dark only
Visual Density: medium-high
Primary Feel: calm, technical, focused
Decorative Elements: minimal
Animations: subtle and functional only
```

Запрещено:

- яркий маркетинговый UI;
- перегруженные карточки;
- декоративные градиенты без функционального смысла;
- чрезмерные анимации;
- визуальный шум вокруг основного документа;
- цветовая кодировка без текстового пояснения.

Разрешено:

- тонкие разделители;
- мягкие hover/focus states;
- компактные status badges;
- моноширинные блоки для технических данных;
- аккуратные side panels;
- restrained accent color для primary actions.

## 14.3. Theme Strategy

На Stage 0 реализуется только одна активная тема:

```text
Default active theme: dark
```

Но архитектура UI должна сразу иметь задел под будущие темы.

Требования:

- все цвета должны задаваться через design tokens;
- запрещены hardcoded color values внутри компонентов;
- тема должна подключаться через CSS variables;
- корневой layout должен поддерживать атрибут `data-theme`;
- компоненты не должны знать конкретную тему, только semantic tokens;
- переключатель тем можно не реализовывать на Stage 0, но архитектура должна позволять добавить его позже.

Пример:

```html
<html data-theme="dark">
```

Пример CSS variables:

```css
:root[data-theme='dark'] {
  --color-bg-base: #0b0f14;
  --color-bg-surface: #111821;
  --color-bg-elevated: #17202b;

  --color-border-subtle: #263241;
  --color-border-strong: #3a4656;

  --color-text-primary: #e6edf3;
  --color-text-secondary: #9ba7b4;
  --color-text-muted: #697586;

  --color-accent-primary: #7c9cff;
  --color-accent-primary-hover: #9bb3ff;

  --color-status-success: #4ade80;
  --color-status-warning: #fbbf24;
  --color-status-danger: #fb7185;
  --color-status-info: #38bdf8;
}
```

## 14.4. Theme Token Model

Frontend должен использовать semantic token model.

```ts
interface ThemeDefinition {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  tokens: {
    background: {
      base: string;
      surface: string;
      elevated: string;
    };
    border: {
      subtle: string;
      strong: string;
    };
    text: {
      primary: string;
      secondary: string;
      muted: string;
      inverse: string;
    };
    accent: {
      primary: string;
      primaryHover: string;
      secondary: string;
    };
    status: {
      success: string;
      warning: string;
      danger: string;
      info: string;
    };
  };
}
```

На Stage 0 в коде должна существовать только `darkTheme`, но структура должна позволять позже добавить:

```text
lightTheme
highContrastDarkTheme
customUserTheme
```

## 14.5. Typography

Требования к типографике:

```text
Base font: system sans-serif
Code font: monospace
Default text size: 14px or 15px
Document reading text: 15px or 16px
Line height: 1.5–1.7 for specification content
```

Интерфейс должен хорошо подходить для долгого чтения и редактирования спецификаций.

Рекомендации:

- не использовать слишком мелкий текст для основного документа;
- metadata, timestamps и technical IDs можно отображать меньшим размером;
- headings спецификации должны визуально отличаться от UI headings;
- markdown document viewer должен быть спокойным и читаемым.

## 14.6. Main Screens

Минимальный UI стадии 0:

```text
Projects List
Project Details
Spec Session Workspace
Spec Document Editor
Artifacts Drawer / Modal
Review Drawer / Modal
Version History Drawer / Modal
Export Dialog
Settings, optional placeholder for future themes/settings
```

Основной рабочий экран Stage 0 состоит из двух вертикальных панелей, а не из трёх постоянных колонок.

## 14.7. Projects List

Назначение:

- показать список SDD projects;
- создать новый проект;
- быстро увидеть состояние спецификации.

Минимальные элементы project card:

```text
Project name
Short description
Spec status
Current version
Last updated
Primary action: Open
```

Состояния:

```text
created
specification_in_progress
specification_approved
ready_for_decomposition
archived
```

UX rule:

```text
Project status должен быть виден без открытия проекта.
```

## 14.8. Project Details

Назначение:

- показать информацию о проекте;
- показать текущую spec session;
- дать возможность продолжить работу над спецификацией;
- показать последние версии и review status.

Минимальные блоки:

```text
Project summary
Current spec status
Latest version
Open questions count
Unconfirmed assumptions count
Blocking issues count
Actions
```

Основные actions:

```text
Start Spec Session
Continue Specification
Generate Draft
Run Review
Approve Spec
Export Bundle
```

Actions должны быть disabled, если состояние спецификации не позволяет их выполнить.

## 14.9. Spec Session Workspace

Главный экран Stage 0.

Базовый layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar: Project / Spec Status / Version / Main Actions       │
├───────────────────┬──────────────────────────────────────────┤
│ Conversation      │ Specification Text Editor                 │
│ Panel             │                                          │
│ 30%               │ 70%                                      │
└───────────────────┴──────────────────────────────────────────┘
```

Рекомендуемые пропорции на desktop:

```text
Conversation Panel: 30%
Specification Text Editor: 70%
```

Артефакты, review, version history и export не являются постоянной третьей колонкой. Они открываются как:

```text
Drawer
Modal
Popover panel
Inline inspector inside editor
```

Приоритет Stage 0:

```text
чат слева помогает формировать и уточнять спецификацию;
редактор справа является главным рабочим пространством;
пользователь может напрямую изменять markdown спецификации.
```

Допустимые настройки:

- скрыть conversation panel;
- открыть artifacts drawer;
- открыть review drawer;
- открыть version history drawer;
- full-screen режим для specification editor.

## 14.10. Top Bar

Top Bar должен показывать:

```text
Project name
Spec status
Current version
Unsaved / processing state
Primary actions
```

Primary actions:

```text
Generate Draft
Review
Approve
Export
```

Правила:

- `Approve` доступна только если review passed;
- `Export` доступен для draft, approved и ready_for_decomposition;
- destructive или scope-changing actions требуют confirmation;
- processing state должен быть виден глобально.

## 14.11. Conversation Panel

Conversation Panel используется для взаимодействия с LLM.

Функции:

- пользователь отвечает на вопросы LLM;
- пользователь запрашивает изменения;
- пользователь вызывает команды;
- LLM объясняет найденные пробелы;
- LLM предлагает уточняющие вопросы.

UX rules:

```text
- LLM должна задавать не больше 5 вопросов за один шаг.
- Blocking questions должны быть визуально отделены от minor questions.
- Ответ пользователя должен приводить к обновлению artifacts panel.
- После извлечения артефактов UI должен показать, что именно было добавлено или изменено.
```

Message states:

```text
sent
processing
processed
failed
```

Для assistant messages нужно показывать:

```text
- краткий ответ;
- extracted artifacts summary;
- links to affected requirements/questions/assumptions;
- retry action on failure.
```

## 14.12. Specification Text Editor

Specification Text Editor — центральная часть интерфейса и главное рабочее пространство Stage 0.

Режимы:

```text
Edit Mode
Preview Mode
Split Edit/Preview Mode, optional
Diff Mode
```

На Stage 0 обязательно:

```text
Edit Mode
Preview Mode after draft generation
Diff Mode for version comparison
```

Пользователь должен иметь возможность напрямую редактировать markdown спецификации.

Документ должен показывать:

- product summary;
- problem;
- target users;
- goals;
- non-goals;
- scenarios;
- requirements;
- assumptions;
- open questions;
- acceptance criteria;
- risks;
- decisions;
- changelog.

UX rule:

```text
Open questions and unconfirmed assumptions must be visible inside the document, not hidden only in side panels.
```

## 14.13. Document Section Status

Каждая секция спецификации может иметь readiness indicator.

```ts
type SectionReadiness =
  | 'empty'
  | 'incomplete'
  | 'draft'
  | 'reviewed'
  | 'approved';
```

UI отображение:

```text
empty       -> muted indicator
incomplete  -> warning indicator
draft       -> neutral indicator
reviewed    -> info/success indicator
approved    -> success indicator
```

Цель:

```text
Пользователь должен быстро понимать, какие части спецификации ещё слабые.
```

## 14.14. Artifacts Drawer

Artifacts Drawer показывает структурированные артефакты, извлечённые из диалога и спецификации.

Artifacts Drawer не является постоянной третьей колонкой Stage 0. Он открывается поверх редактора или сбоку по запросу пользователя.

Типы артефактов:

```text
Requirements
Assumptions
Open Questions
Acceptance Criteria
Risks
Decisions
Goals
Non-Goals
Scenarios
Target Users
```

Фильтры:

```text
Artifact type
Status
Priority / Severity
Requires confirmation
Source type
```

Каждый artifact card должен показывать:

```text
Title
Short description
Type
Status
Priority / severity / impact
Source
Confidence
Requires user confirmation
Related artifacts
Last updated
```

Actions:

```text
Confirm
Reject
Edit
Convert to Requirement
Convert to Assumption
Mark as Answered
Link to Requirement
```

На Stage 0 можно реализовать только минимальный набор:

```text
Confirm
Reject
Edit
```

## 14.15. Artifact Source UX

Пользователь должен понимать, откуда появился артефакт.

Source badges:

```text
User explicit
User implicit
LLM inferred
LLM suggested
System generated
```

Правило:

```text
LLM inferred / LLM suggested artifacts must be visually distinguishable and require confirmation if they affect product scope.
```

Для каждого артефакта должен быть доступен source trace:

```text
View source message
View related decision
View related requirement
```

## 14.16. Review Drawer

Review Drawer показывает готовность спецификации к утверждению.

Review Drawer открывается по запросу пользователя или после завершения background job review.

Состав:

```text
Approval readiness summary
Blocking issues
Warnings
Missing sections
Unresolved open questions
Unconfirmed assumptions
Contradictions
Recommended next actions
```

Review Panel должен отвечать на вопрос:

```text
Why can or cannot this spec be approved?
```

Primary states:

```text
Not reviewed
Review running
Can approve
Cannot approve
Review failed
```

Actions:

```text
Run Review
Resolve Blocking Issues
Generate Clarifying Questions
Approve Spec
```

## 14.17. Version History Drawer

Version History Drawer показывает:

```text
Version number
Status
Created at
Created by
Change summary
Review status
Approval status
```

Actions:

```text
Open version
Compare with current
Export version
Restore as draft, optional later
```

Diff Mode должен поддерживать:

```text
Markdown section diff
Artifact diff
Requirement diff
Assumption diff
Open question diff
Acceptance criteria diff
```

На Stage 0 достаточно:

```text
Markdown diff
Artifact list diff
```

## 14.18. Export Dialog

Export Dialog должен позволять выгрузить:

```text
Markdown
JSON
Bundle
```

UI должен явно показывать, что входит в bundle:

```text
product.md
requirements.json
assumptions.json
open-questions.json
acceptance-criteria.json
risks.json
changelog.md
spec-meta.json
```

Если спецификация не готова к Stage 1, export dialog должен показывать warning, но не обязательно блокировать export draft.

## 14.19. Empty States

Пустые состояния должны быть полезными, а не декоративными.

Примеры:

```text
No projects yet -> Create your first SDD project.
No spec session yet -> Start by describing the product idea.
No requirements yet -> Answer clarification questions or generate initial extraction.
No draft yet -> Generate draft from collected artifacts.
No review yet -> Run review to check approval readiness.
```

## 14.20. Loading and Processing States

LLM operations могут занимать несколько секунд, поэтому UI должен явно показывать текущую операцию.

Processing states:

```text
Extracting artifacts
Generating questions
Generating draft
Running review
Creating version
Exporting bundle
```

Требования:

- показывать operation label;
- блокировать только те actions, которые конфликтуют с текущей операцией;
- не блокировать весь интерфейс без необходимости;
- показывать recoverable error с retry action.

## 14.21. Error UX

Ошибки должны быть actionable.

Пример:

```text
Draft generation failed because LLM output did not match schema.
Action: Retry generation
Action: View technical details
```

Типы ошибок:

```text
Validation error
LLM provider error
Network error
Permission error
Conflict error
Approval blocked
```

Для технических ошибок нужно иметь collapsible details, чтобы не перегружать основной UI.

## 14.22. Minimal Responsive Behavior

Stage 0 в первую очередь ориентирована на desktop.

Минимальные требования:

```text
Desktop: full three-panel layout
Tablet: two-panel layout with switchable right panel
Mobile: not optimized, but should remain readable
```

Mobile support не является приоритетом Stage 0.

## 14.23. Accessibility

Минимальные требования:

- все interactive элементы доступны с клавиатуры;
- focus state должен быть видимым;
- цвет не должен быть единственным способом передачи статуса;
- contrast должен быть достаточным для dark UI;
- panels и dialogs должны иметь корректные ARIA labels;
- command buttons должны иметь понятные labels.

## 14.24. UI Component Categories

Минимальные компоненты:

```text
Button
IconButton
Input
Textarea
Select
Tabs
Badge
Card
Panel
Drawer
Modal
Tooltip
DropdownMenu
StatusIndicator
MarkdownViewer
DiffViewer
ArtifactCard
ReviewIssueCard
VersionCard
CommandBar
```

Компоненты должны использовать design tokens и не содержать hardcoded theme values.

## 14.25. Frontend State Model

Минимальные Pinia stores:

```text
projectStore
specSessionStore
conversationStore
artifactStore
specDocumentStore
reviewStore
versionStore
backgroundJobStore
localDraftStore
themeStore
uiStore
```

`themeStore` на Stage 0 хранит только активную dark theme, но должен иметь API, совместимый с будущим переключением тем.

Пример:

```ts
interface ThemeState {
  activeThemeId: 'dark';
  availableThemes: ThemeDefinition[];
}
```

## 14.26. UI Acceptance Criteria

UI/UX Stage 0 считается готовым, если:

```text
- пользователь может создать проект;
- пользователь может начать spec session;
- пользователь может вести диалог с LLM;
- пользователь видит текущую спецификацию в правой панели-редакторе;
- пользователь может напрямую редактировать markdown спецификации;
- пользователь видит извлечённые артефакты в drawer/modal;
- пользователь может подтвердить или отклонить LLM-inferred артефакты;
- пользователь может сгенерировать draft;
- пользователь может запустить review;
- пользователь видит, почему спецификация может или не может быть утверждена;
- пользователь может утвердить спецификацию при выполнении условий;
- пользователь может посмотреть историю версий;
- пользователь может экспортировать спецификацию;
- весь UI работает в dark theme;
- все компоненты используют theme tokens;
- добавление будущей light/custom theme не требует переписывания компонентов.
```

---

# 15. Events

Система должна генерировать доменные события.

```ts
type DomainEvent =
  | SpecSessionStartedEvent
  | UserMessageReceivedEvent
  | ArtifactsExtractedEvent
  | DraftSpecGeneratedEvent
  | SpecReviewCompletedEvent
  | SpecApprovedEvent
  | SpecChangedEvent
  | SpecVersionCreatedEvent;
```

Пример:

```ts
interface SpecApprovedEvent {
  type: 'spec.approved';
  projectId: string;
  sessionId: string;
  versionId: string;
  approvedAt: string;
}
```

Назначение событий:

- аудит;
- отладка;
- последующая интеграция со стадией 1;
- построение event timeline в UI.

---

# 16. Security and Safety

## 16.1. Prompt Injection

На стадии 0 пользовательский ввод не должен иметь возможность изменить системные правила LLM chains.

Правила:

- пользовательский ввод всегда передаётся как data, а не как instruction;
- system prompt отделён от user content;
- LLM output валидируется схемой;
- запрещено исполнять инструкции из спецификации как системные команды.

## 16.2. Data Integrity

- Все изменения спецификации должны проходить через application service.
- Нельзя менять approved spec без создания новой версии.
- Нельзя удалять requirement физически, только переводить в `deprecated` или `rejected`.
- Все изменения должны попадать в changelog.

## 16.3. Auditability

Для каждого важного артефакта нужно знать:

```text
- who/what created it;
- from which conversation turn;
- when it was created;
- whether it was confirmed by user;
- what changed over time.
```

---

# 17. Readiness for Stage 1

## 17.1. Stage 1 Input Contract

Стадия 0 должна экспортировать bundle, который будет входом для стадии 1.

```ts
interface Stage1InputBundle {
  specMeta: SpecMeta;
  productSpecMarkdown: string;
  productSpecJson: ProductSpecJson;
  requirements: Requirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  decisions: Decision[];
  risks: Risk[];
}
```

## 17.2. Ready for Decomposition Criteria

Спецификация готова к декомпозиции, если:

```text
- status = ready_for_decomposition;
- version >= 1.0.0;
- approval validation passed;
- no blocking open questions;
- no critical unconfirmed assumptions;
- all must-have requirements have acceptance criteria;
- exported bundle is valid against Stage1InputBundle schema.
```

---

# 18. Non-Functional Requirements

## 18.1. Reliability

- Система не должна терять историю сообщений.
- Система не должна терять версии спецификаций.
- Ошибка LLM не должна повреждать текущую спецификацию.

## 18.2. Observability

Нужно логировать:

- LLM chain name;
- trace id;
- duration;
- validation result;
- token usage, if available;
- error type;
- created artifact counts.

## 18.3. Performance

Для стадии 0 допустимо:

```text
Generate draft: <= 30 seconds
Run review: <= 30 seconds
Extract artifacts from message: <= 10 seconds
Load spec workspace: <= 2 seconds
```

## 18.4. Maintainability

- Все схемы должны быть типизированы.
- Prompt templates должны храниться отдельно от business logic.
- LLM provider должен быть заменяемым.
- Сервисы не должны зависеть напрямую от конкретного LLM SDK.

---

# 19. Technology Baseline

Этот раздел фиксирует базовый стек разработки Stage 0. В отличие от предыдущего варианта, стек не является рекомендательным: он задаёт предпочтительную технологическую основу проекта.

## 19.1. Backend

Базовый backend stack:

```text
Runtime: Node.js
Language: TypeScript
Framework: NestJS
Database: PostgreSQL
Validation: Zod
API Style: REST for Stage 0
Optional API Style Later: GraphQL / tRPC
```

Обоснование:

- Node.js и TypeScript хорошо подходят для быстрой разработки LLM-oriented backend;
- NestJS даёт модульную архитектуру, dependency injection, guards, interceptors, pipes и удобную структуру для domain/application слоёв;
- PostgreSQL подходит для хранения проектов, сессий, версий спецификаций и JSONB-артефактов;
- Zod используется для runtime validation, особенно для LLM outputs.

## 19.2. Frontend

Базовый frontend stack:

```text
Framework: Vue.js
Language: TypeScript
Build Tool: Vite
State Management: Pinia
Router: Vue Router
UI Components: PrimeVue or custom component system
Styling: Tailwind CSS
Theme Strategy: dark-first design tokens via CSS variables
Markdown Rendering: markdown-it / Shiki for code highlighting
```

Обоснование:

- Vue.js используется как основной UI-фреймворк;
- Vite даёт быстрый dev-сервер и простую сборку;
- Pinia достаточно проста для управления состоянием spec workspace;
- Tailwind подходит для быстрого создания интерфейса с панелями, split-view и карточками артефактов;
- dark-first tokenized theming позволяет начать с одной минималистичной dark theme и позже добавить light/custom themes без переписывания компонентов.

## 19.3. Database

Основная БД:

```text
PostgreSQL
```

Использование PostgreSQL:

```text
Relational tables — projects, sessions, versions, messages
JSONB — structured spec artifacts and review reports
Indexes — project/session/status queries
Optional later: pgvector for semantic search over specs and artifacts
```

## 19.4. ORM / Query Layer

Stage 0 использует Drizzle ORM как основной query layer.

```text
ORM / Query Layer: Drizzle ORM
Migration Tooling: drizzle-kit
Database: PostgreSQL
```

Причины:

- хорошо сочетается с TypeScript;
- ближе к SQL и не скрывает модель данных;
- удобен для PostgreSQL-first подхода;
- проще контролировать JSONB, индексы и миграции;
- хорошо подходит для event store, read models и DB-backed job queue.

Prisma не используется на Stage 0.

## 19.5. LLM Layer

Базовый LLM stack:

```text
LLM Orchestration: LangChain.js
Prompt Templates: @langchain/core/prompts
Provider Integrations: @langchain/openai, @langchain/anthropic, @langchain/google-genai
Validation: Zod
Tracing: LangSmith optional + internal audit log required
Future Stateful Workflows: LangGraph.js, optional later
```

Архитектурное решение:

```text
LangChain.js is an infrastructure dependency, not a domain dependency.
```

Слои взаимодействия:

```text
Application Service
  ↓
LlmChain interface
  ↓
LlmChainRunner
  ↓
Internal LlmProvider abstraction
  ↓
LangChain.js provider implementation
  ↓
Concrete LLM provider API
```

LangChain.js используется для:

```text
- ChatModel integrations;
- ChatPromptTemplate;
- structured output;
- runnable composition;
- callbacks/tracing;
- streaming for non-critical UI responses;
- optional LangSmith integration.
```

LangChain.js не используется для:

```text
- хранения состояния спецификации;
- принятия approval decisions без application validation;
- прямого доступа к БД;
- прямого изменения domain entities;
- обхода Zod/domain validation.
```

## 19.6. Monorepo Structure

Рекомендуемая структура репозитория:

```text
sdd-ai-company/
  apps/
    api/                 # NestJS backend
    web/                 # Vue.js frontend
  packages/
    domain/              # shared domain types
    schemas/             # Zod schemas
    llm-contracts/       # LLM chain input/output contracts
    spec-format/         # ProductSpecJson, exports, diff utils
    ui-kit/              # optional shared UI components
  infra/
    docker/
    migrations/
  docs/
    specs/
    architecture/
```

## 19.7. Backend Module Structure

```text
apps/api/src/
  modules/
    projects/
    spec-sessions/
    conversations/
    spec-artifacts/
    spec-generation/
    spec-review/
    spec-versioning/
    llm/
    exports/
  shared/
    domain/
    validation/
    errors/
    events/
    database/
    config/
```

NestJS modules должны соответствовать bounded contexts, а не техническим слоям.

## 19.8. Frontend Module Structure

```text
apps/web/src/
  app/
    router/
    providers/
  pages/
    projects/
    spec-session/
  widgets/
    spec-workspace/
    artifacts-panel/
    review-panel/
    version-history/
  features/
    create-project/
    start-spec-session/
    send-spec-message/
    approve-spec/
    export-spec/
  entities/
    project/
    spec-session/
    spec-artifact/
    spec-version/
  shared/
    api/
    ui/
    lib/
    types/
```

Для frontend можно использовать Feature-Sliced Design как ориентир, но не обязательно строго следовать ему на Stage 0.

## 19.9. Development Tooling

```text
Package Manager: pnpm
Monorepo Tooling: pnpm workspaces
Linting: ESLint
Formatting: Prettier
Testing: Vitest for shared packages and frontend
Backend Testing: Jest or Vitest
E2E Testing: Playwright, optional for Stage 0
Containerization: Docker Compose
Local Database: PostgreSQL in Docker
```

## 19.10. Local Development Environment

Минимальный local dev setup:

```text
1. pnpm install
2. docker compose up -d postgres
3. pnpm db:migrate
4. pnpm dev
```

Ожидаемые локальные сервисы:

```text
API: http://localhost:3000
Web: http://localhost:5173
PostgreSQL: localhost:5432
```

## 19.11. Docker Compose Services

Минимальный docker-compose для Stage 0:

```text
postgres
api
web, optional for containerized dev
worker, optional as separate process
```

Позже можно добавить:

```text
redis — Redis/BullMQ for Stage 1 job processing
minio — object storage for exported bundles, if needed later
pgadmin — local database inspection
```

На Stage 0 Redis/BullMQ не используются. Background jobs работают через PostgreSQL-backed queue.

## 19.12. Testing Strategy

Минимальные уровни тестирования:

```text
Unit tests:
- domain validation
- Zod schemas
- approval rules
- diff logic

Integration tests:
- project creation
- spec session flow
- artifact persistence
- version creation
- approval blocking rules

LLM contract tests:
- mocked provider responses
- invalid JSON repair
- schema validation failure
- duplicate extraction prevention
```

## 19.13. Architectural Constraint

Выбранный стек не должен протекать в доменную модель.

Правило:

```text
Domain types and spec schemas must not depend on NestJS, Vue.js, Drizzle or any LLM SDK.
```

Это позволит позже переиспользовать доменное ядро в CLI, worker-процессах, тестах или будущих стадиях системы.

---

# 20. MVP Acceptance Criteria for Stage 0

Стадия 0 считается готовой, если выполнены следующие критерии.

## 20.1. Project and Session

- пользователь может создать проект;
- пользователь может начать spec session с raw idea;
- система сохраняет историю диалога.

## 20.2. Artifact Extraction

- система извлекает requirements из сообщений пользователя;
- система извлекает assumptions;
- система извлекает open questions;
- система извлекает decisions;
- каждый артефакт имеет source и confidence;
- LLM-inferred артефакты требуют подтверждения.

## 20.3. Draft Generation

- система генерирует `product.md`;
- система генерирует `requirements.json`;
- система генерирует `assumptions.json`;
- система генерирует `open-questions.json`;
- система генерирует `acceptance-criteria.json`.

## 20.4. Review

- система находит missing sections;
- система находит blocking open questions;
- система находит unconfirmed critical assumptions;
- система не разрешает approval при blocking issues.

## 20.5. Versioning

- система создаёт версии спецификации;
- система показывает diff между версиями;
- система ведёт changelog;
- утверждённая версия получает номер `1.0.0`.

## 20.6. Approval and Export

- пользователь может утвердить спецификацию;
- система переводит её в `ready_for_decomposition`;
- система экспортирует bundle для стадии 1;
- экспортируемый bundle проходит schema validation.

---

# 21. Implementation Milestones

## Milestone 1: Domain Core

- TypeScript domain types;
- Zod schemas;
- Project entity;
- SpecSession entity;
- SpecArtifact abstraction;
- persistence schema.

## Milestone 2: Conversation and Extraction

- conversation storage;
- Extractor chain;
- artifact validation;
- artifact persistence;
- duplicate detection.

## Milestone 3: Draft Generation

- ProductSpecJson assembler;
- Spec Writer chain;
- Markdown generation;
- first version creation.

## Milestone 4: Review and Approval

- Critic chain;
- Reviewer chain;
- approval validation;
- review report UI/API.

## Milestone 5: Versioning and Export

- version history;
- diff;
- changelog;
- markdown/json/bundle export.

## Milestone 6: Minimal UI

- project list;
- spec workspace;
- artifacts panel;
- review panel;
- version history;
- export dialog.

---

# 22. Key Architectural Decisions

## 22.1. Specification-first architecture

Все последующие стадии должны использовать утверждённую спецификацию как контракт.

## 22.2. LLM output is untrusted until validated

LLM не является источником истины. Она создаёт предложения, которые проходят валидацию и подтверждение.

## 22.3. Artifact-based system

Система строится вокруг артефактов, а не вокруг сообщений чата.

## 22.4. Approval is a formal transition

Approval — не просто сообщение пользователя “ок”. Это переход состояния, который требует прохождения validation и создания immutable version snapshot.

## 22.5. Stage 0 creates input for Stage 1

Стадия 0 должна завершаться не “красивым текстом”, а формальным bundle, который может быть машинно обработан следующей стадией.

## 22.6. Event sourcing from the beginning

Event sourcing используется сразу на Stage 0 для аудита, восстановления состояния и трассировки изменений спецификации.

## 22.7. Local-first development paradigm

Stage 0 проектируется как local-first система для одного пользователя с локальной PostgreSQL БД и локальным запуском backend/frontend.

## 22.8. Direct specification editing

Пользователь должен иметь возможность напрямую редактировать markdown спецификации. Такие изменения проходят через versioning, event store и повторную валидацию.

## 22.9. Background LLM jobs without Redis on Stage 0

LLM chains запускаются через background jobs. На Stage 0 используется PostgreSQL-backed queue, Redis/BullMQ откладываются до Stage 1.

## 22.10. Two-panel UI layout

Основной UI Stage 0 — две вертикальные панели: слева чат 30%, справа markdown-редактор спецификации 70%.

---

# 23. Resolved Technical Decisions

Все ключевые технические вопросы для Stage 0 закрыты.

## 23.1. Decisions

```text
1. ORM / Query Layer:
   Use Drizzle ORM.

2. Event Sourcing:
   Use event sourcing from Stage 0.

3. Markdown Snapshots:
   Store Markdown snapshots in PostgreSQL.

4. Specification Editing:
   User can directly edit the specification.

5. Local-first:
   Stage 0 follows the local-first paradigm.

6. Users:
   Stage 0 supports only one user.

7. Git Integration:
   No Git integration on Stage 0.

8. Minimal UI Layout:
   Two vertical panels:
   - left: chat, 30%;
   - right: text editor with opened specification, 70%.

9. LLM Execution:
   Run LLM chains through background jobs.

10. Redis/BullMQ:
   Do not add Redis/BullMQ on Stage 0. Leave it for Stage 1.
```

## 23.2. Resulting Constraints

```text
- PostgreSQL must support event store, read models, markdown snapshots and DB-backed jobs.
- UI must prioritize text editing over artifact panels.
- Artifacts/review/version history should be drawers or modals, not persistent third column.
- Direct edits must create domain events and versions.
- Approved specs must require reapproval after scope-changing direct edits.
- Background job contracts must be compatible with future Redis/BullMQ migration.
```

---

# 24. Summary

Стадия 0 — это фундамент всей SDD-системы.

Её задача — доказать, что LLM может быть не просто генератором текста, а управляемым инструментом совместного создания спецификаций.

Ключевой результат стадии 0:

```text
Raw product idea
  -> structured specification
  -> reviewed specification
  -> approved specification
  -> validated Stage 1 input bundle
```

После реализации этой стадии можно переходить к Stage 1: декомпозиции утверждённой спецификации на задачи.

