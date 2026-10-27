import { expect, test } from '@playwright/test';

type Event = {
  sequence: number;
  round: number;
  agent: string;
  observation: { value: number; target: number };
  action: number;
  reasoning: string;
  value_before: number;
  value_after: number;
};

type Experiment = {
  id: number;
  name: string;
  status: string;
  result: { final_value: number; target_reached: boolean; rounds: number; total_actions: number; scores: { agent: string; contribution: number }[] } | null;
  trace: Event[];
};

test('create, run, replay and restore a real experiment', async ({ page }) => {
  const name = `Browser acceptance ${Date.now()}`;
  await page.goto('/');
  await page.getByLabel('Experiment name').fill(name);
  await page.getByLabel(/^Seed/).fill('42');
  await page.getByLabel(/^Target/).fill('20');
  await page.getByLabel('Round limit').fill('10');
  await page.getByLabel('Agent 1 name').fill('Ada');
  await page.getByLabel('Agent 1 strategy').selectOption('greedy');
  await page.getByLabel('Agent 2 name').fill('Grace');
  await page.getByLabel('Agent 2 strategy').selectOption('cautious');

  const createdResponse = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/experiments');
  await page.getByRole('button', { name: 'Create experiment' }).click();
  const created = await createdResponse;
  expect(created.ok()).toBeTruthy();
  const draft = await created.json() as Experiment;
  expect(draft.name).toBe(name);
  expect(draft.status).toBe('draft');
  expect(draft.result).toBeNull();
  expect(draft.trace).toEqual([]);

  const runResponse = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === `/experiments/${draft.id}/run`);
  await page.getByRole('button', { name: 'Run experiment' }).click();
  const run = await runResponse;
  expect(run.ok()).toBeTruthy();
  const completed = await run.json() as Experiment;
  expect(completed.status).toBe('completed');
  expect(completed.result).not.toBeNull();
  expect(completed.trace.length).toBeGreaterThan(1);
  expect(completed.trace.map(event => event.sequence)).toEqual(completed.trace.map((_, index) => index + 1));
  expect(completed.result!.total_actions).toBe(completed.trace.length);
  expect(completed.result!.final_value).toBe(completed.trace.at(-1)!.value_after);

  const result = completed.result!;
  const results = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Results', exact: true }) });
  await expect(results).toContainText(`${result.final_value} / 20`);
  await expect(results).toContainText(result.target_reached ? 'Target reached' : 'Target not reached');
  await expect(results.locator('.metric').filter({ hasText: 'ROUNDS' })).toContainText(String(result.rounds));
  await expect(results.locator('.metric').filter({ hasText: 'ACTIONS' })).toContainText(String(result.total_actions));
  for (const score of result.scores) {
    await expect(results.locator('.contributions > div').filter({ hasText: score.agent })).toContainText(`+${score.contribution}`);
  }

  const replay = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Trace replay' }) });
  const previous = replay.getByRole('button', { name: 'Previous' });
  const next = replay.getByRole('button', { name: 'Next' });
  await expect(previous).toBeDisabled();
  const checkEvent = async (event: Event) => {
    await expect(replay.locator('.progress-track')).toHaveAttribute('aria-label', `Replay step ${event.sequence} of ${completed.trace.length}`);
    await expect(replay.locator('.trace-meta')).toContainText(`EVENT ${event.sequence}`);
    await expect(replay.locator('.trace-summary')).toContainText(event.agent);
    await expect(replay.locator('.state-change')).toContainText(`${event.value_before}+${event.action} →${event.value_after}`);
    await expect(replay.locator('.trace-details')).toContainText(`Value ${event.observation.value} / target ${event.observation.target}`);
    await expect(replay.locator('.trace-details')).toContainText(event.reasoning);
  };
  await next.click();
  await checkEvent(completed.trace[0]);
  await next.click();
  await checkEvent(completed.trace[1]);
  await previous.click();
  await checkEvent(completed.trace[0]);
  await replay.getByRole('button', { name: 'Reset' }).click();
  await expect(replay).toContainText('At the starting line.');

  // A second run request is deliberately real and verifies persisted idempotency.
  const repeated = await page.request.post(run.url());
  expect(repeated.ok()).toBeTruthy();
  const repeatedDetail = await repeated.json() as Experiment;
  expect(repeatedDetail.result).toEqual(completed.result);
  expect(repeatedDetail.trace).toEqual(completed.trace);

  await page.reload();
  await page.getByRole('complementary', { name: 'Experiment history' }).getByRole('button', { name }).click();
  await expect(page.getByRole('heading', { name: `${name}.` })).toBeVisible();
  await expect(results).toContainText(`${result.final_value} / 20`);
  await next.click();
  await checkEvent(completed.trace[0]);
});

test('rejects duplicate agent names with a useful error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Experiment name').fill('Invalid agents');
  await page.getByLabel('Agent 1 name').fill('Same');
  await page.getByLabel('Agent 2 name').fill('same');
  await page.getByRole('button', { name: 'Create experiment' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Agent names must be distinct' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run experiment' })).toHaveCount(0);
});

test('mobile setup remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set the stage.' })).toBeVisible();
  await expect(page.getByLabel('Agent 2 strategy')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../docs/proof/mobile-setup.png', fullPage: true });
});
