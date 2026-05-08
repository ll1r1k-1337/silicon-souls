import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

type JobRef = {
  jobId: string;
  type: string;
  status: string;
};

type Workspace = {
  session: { id: string; status: string };
  conversation: Array<{ role: string; content: string }>;
  artifacts: Array<{
    id: string;
    artifactType: string;
    status: string;
    payload: Record<string, unknown>;
  }>;
  versions: Array<{ id: string; version: string }>;
  review?: {
    canApprove?: boolean;
    payload: {
      canApprove: boolean;
      blockingIssues: string[];
      contradictions: string[];
    };
  };
};

const jobTimeoutMs = Number(process.env.E2E_JOB_TIMEOUT_MS ?? 10 * 60 * 1000);
const pollIntervalMs = 1500;

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
}

async function readJson<T>(response: { ok(): boolean; status(): number; text(): Promise<string>; json(): Promise<T> }, label: string): Promise<T> {
  if (response.ok()) {
    return response.json();
  }

  throw new Error(`${label} failed with HTTP ${response.status()}: ${await response.text()}`);
}

async function waitForJob(request: APIRequestContext, job: JobRef): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < jobTimeoutMs) {
    const response = await request.get(`/api/jobs/${job.jobId}`);
    const state = await readJson<{
      jobId: string;
      type: string;
      status: string;
      error?: unknown;
    }>(response, `GET /api/jobs/${job.jobId}`);

    if (state.status === 'completed') {
      return;
    }

    if (state.status === 'failed' || state.status === 'cancelled') {
      throw new Error(
        `Background job ${state.type} (${state.jobId}) ended as ${state.status}: ${JSON.stringify(
          state.error,
        )}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for background job ${job.type} (${job.jobId})`);
}

async function waitForJobs(request: APIRequestContext, jobs: JobRef[] = []): Promise<void> {
  for (const job of jobs) {
    await waitForJob(request, job);
  }
}

async function getWorkspace(request: APIRequestContext, sessionId: string): Promise<Workspace> {
  const response = await request.get(`/api/spec-sessions/${sessionId}`);
  return readJson<Workspace>(response, `GET /api/spec-sessions/${sessionId}`);
}

async function waitForWorkspace(
  request: APIRequestContext,
  sessionId: string,
  predicate: (workspace: Workspace) => boolean,
  description: string,
  timeoutMs = 2 * 60 * 1000,
): Promise<Workspace> {
  const startedAt = Date.now();
  let latest: Workspace | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    latest = await getWorkspace(request, sessionId);
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Timed out waiting for workspace condition: ${description}. Latest session status: ${
      latest?.session.status ?? 'unknown'
    }`,
  );
}

async function createProject(page: Page, name: string, description: string): Promise<string> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SDD projects' })).toBeVisible();
  await page.getByPlaceholder('Project name').fill(name);
  await page.getByPlaceholder('Short product idea or project description').fill(description);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/projects\/prj_/);
  await expect(page.getByRole('heading', { name })).toBeVisible();

  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

async function startSpecSession(page: Page, rawIdea: string): Promise<string> {
  await page.getByPlaceholder('Describe the raw product idea').fill(rawIdea);
  await page.getByRole('button', { name: 'Start Spec Session' }).click();
  await expect(page).toHaveURL(/\/sessions\/spec_/);
  await expect(page.getByTestId('spec-topbar')).toBeVisible();

  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

async function answerVisibleOpenQuestions(
  page: Page,
  request: APIRequestContext,
  maxQuestions = 3,
): Promise<number> {
  const cards = page.getByTestId('chat-question-card');
  const visible = await cards.count();
  if (visible === 0) {
    return 0;
  }

  const cardsToAnswer = Math.min(maxQuestions, visible);
  for (let index = 0; index < cardsToAnswer; index += 1) {
    const card = cards.nth(index);
    const freeTextAnswer = card.getByTestId('chat-question-answer');
    if ((await freeTextAnswer.count()) > 0) {
      await freeTextAnswer.fill('For this e2e run, use the primary local product owner workflow.');
      continue;
    }

    const choice = card.locator('input[type="radio"], input[type="checkbox"]').first();
    if ((await choice.count()) > 0) {
      await choice.check({ force: true });
    }

    const customAnswer = card.getByTestId('chat-question-custom-answer');
    if ((await customAnswer.count()) > 0 && (await customAnswer.isVisible())) {
      await customAnswer.fill('Local product owner');
    }
  }

  const submit = page.getByTestId('submit-chat-questionnaire').first();
  await expect(submit).toBeEnabled();
  const messageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/spec-sessions/') &&
      response.url().endsWith('/messages') &&
      response.request().method() === 'POST',
  );
  await submit.click();

  const payload = await readJson<{ jobs: JobRef[] }>(
    await messageResponse,
    'POST /api/spec-sessions/:sessionId/messages (questionnaire_answers)',
  );
  await waitForJobs(request, payload.jobs ?? []);
  await page.reload();
  await expect(page.getByTestId('spec-topbar')).toBeVisible();
  return cardsToAnswer;
}

async function expectExports(request: APIRequestContext, sessionId: string): Promise<void> {
  const markdown = await request.get(`/api/spec-sessions/${sessionId}/export?format=markdown`);
  expect(markdown.ok()).toBeTruthy();
  expect((await markdown.text()).trim().length).toBeGreaterThan(20);

  const json = await request.get(`/api/spec-sessions/${sessionId}/export?format=json`);
  const spec = await readJson<{
    meta: { sessionId: string };
    requirements: unknown[];
    assumptions: unknown[];
    openQuestions: unknown[];
    acceptanceCriteria: unknown[];
    decisions: unknown[];
    risks: unknown[];
  }>(
    json,
    'JSON export',
  );
  expect(spec.meta.sessionId).toBe(sessionId);
  const extractedItemsCount =
    spec.requirements.length +
    spec.assumptions.length +
    spec.openQuestions.length +
    spec.acceptanceCriteria.length +
    spec.decisions.length +
    spec.risks.length;
  expect(extractedItemsCount).toBeGreaterThan(0);

  const prompt = await request.get(`/api/spec-sessions/${sessionId}/export?format=llm-prompt`);
  expect(prompt.ok()).toBeTruthy();
  expect(await prompt.text()).toContain('Structured product specification JSON');

  const bundle = await request.get(`/api/spec-sessions/${sessionId}/export?format=bundle`);
  expect(bundle.ok()).toBeTruthy();
  expect(bundle.headers()['content-type']).toContain('application/zip');
  expect((await bundle.body()).byteLength).toBeGreaterThan(100);
}

test('preflight uses a configured real OpenAI-compatible LLM', async ({ request }) => {
  const settings = await readJson<{
    providerType: string;
    model: string;
    hasApiKey: boolean;
    isConfigured: boolean;
  }>(await request.get('/api/settings/llm'), 'GET /api/settings/llm');

  expect(settings.providerType).toBe('openai_compatible');
  expect(settings.isConfigured).toBe(true);
  expect(settings.hasApiKey).toBe(true);
  expect(settings.model).toBe(process.env.MODEL_ID);

  const smoke = await readJson<{
    ok: boolean;
    message: string;
    error?: string;
  }>(await request.post('/api/settings/llm/test', { data: {} }), 'POST /api/settings/llm/test');

  expect(smoke.ok, smoke.error ?? smoke.message).toBe(true);
});

test('settings drawer shows the real provider configuration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();

  await expect(page.getByTestId('llm-settings-form')).toBeVisible();
  await expect(page.getByTestId('llm-settings-status')).toContainText('configured');
  await expect(page.getByTestId('llm-model-input')).toHaveValue(process.env.MODEL_ID ?? '');
});

test('project can be created, opened, and deleted through the UI', async ({ page }) => {
  const name = uniqueName('E2E project smoke');
  const description = 'Short product idea for e2e project management smoke coverage.';

  await createProject(page, name, description);
  await page.getByRole('link', { name: 'Projects' }).click();
  await expect(page).toHaveURL('/');

  const card = page.locator('.project-card').filter({ hasText: name });
  await expect(card).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(card).toHaveCount(0);
});

test('full SDD flow reaches draft, review blockers, and exports', async ({ page, request }) => {
  const projectName = uniqueName('E2E SDD flow');
  const rawIdea =
    'Build a local-first SDD workspace for a product owner. The MVP must create projects, capture a raw idea, maintain a product specification, review approval readiness, and export a Stage 1 bundle. Data must persist in PostgreSQL and the worker must process LLM-backed background jobs.';
  const message =
    'The product owner must be able to create a project, start a specification session, send clarification messages, generate a draft, run a review, and export markdown, JSON, bundle, and implementation prompt formats. Assume this is single-user local software. Risk: OpenAI-compatible providers can return invalid structured output or be temporarily unavailable.';

  await createProject(page, projectName, rawIdea);
  const sessionId = await startSpecSession(page, rawIdea);

  await expect(page.getByTestId('llm-status')).not.toContainText('mock LLM');
  await expect(page.getByTestId('document-preview-panel')).toBeVisible();
  const topbar = page.getByTestId('spec-topbar');

  const messageResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/spec-sessions/') &&
      response.url().endsWith('/messages') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('chat-input').fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
  const messagePayload = await readJson<{ jobs: JobRef[] }>(
    await messageResponse,
    'POST /api/spec-sessions/:sessionId/messages',
  );
  await waitForJobs(request, messagePayload.jobs);

  await waitForWorkspace(
    request,
    sessionId,
    (workspace) =>
      workspace.conversation.some((turn) => turn.role === 'assistant') &&
      workspace.artifacts.some((artifact) => artifact.artifactType === 'open_question'),
    'assistant response with open questions',
  );
  await page.reload();
  await expect(page.getByTestId('message-assistant').first()).toBeVisible();
  await expect(page.getByTestId('chat-question-card').first()).toBeVisible();

  const answered = await answerVisibleOpenQuestions(page, request);
  expect(answered).toBeGreaterThan(0);

  const draftResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/spec-sessions/') &&
      response.url().endsWith('/messages') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('chat-input').fill('/generate-draft');
  await page.getByRole('button', { name: 'Send' }).click();
  const draftPayload = await readJson<{ jobs: JobRef[] }>(
    await draftResponse,
    'POST /api/spec-sessions/:sessionId/messages (/generate-draft)',
  );
  await waitForJobs(request, draftPayload.jobs);

  await waitForWorkspace(
    request,
    sessionId,
    (workspace) => workspace.versions.some((version) => version.version === '0.1.0'),
    'draft version 0.1.0',
  );
  await page.reload();
  await expect(page.getByTestId('spec-version')).toContainText('0.1.0');
  await expect(page.getByTestId('document-preview-content')).toBeVisible();

  const reviewResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/spec-sessions/') &&
      response.url().endsWith('/messages') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('chat-input').fill('/review-spec');
  await page.getByRole('button', { name: 'Send' }).click();
  const reviewPayload = await readJson<{ jobs: JobRef[] }>(
    await reviewResponse,
    'POST /api/spec-sessions/:sessionId/messages (/review-spec)',
  );
  await waitForJobs(request, reviewPayload.jobs);

  await waitForWorkspace(
    request,
    sessionId,
    (workspace) =>
      Boolean(workspace.review) &&
      workspace.review!.payload.canApprove === false &&
      workspace.review!.payload.blockingIssues.length > 0,
    'review blockers',
  );
  await page.reload();
  await expect(page.getByTestId('review-blockers-section')).toBeVisible();
  await expect(topbar.getByRole('button', { name: 'Approve' })).toBeDisabled();

  await page.locator('summary').filter({ hasText: 'More' }).click();
  await topbar.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('heading', { name: 'Export specification' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Markdown' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'JSON' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bundle' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'LLM Prompt' })).toBeVisible();

  await expectExports(request, sessionId);
});
