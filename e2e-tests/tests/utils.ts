import { Browser, Page, TestInfo, APIRequestContext, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserData {
  name: string;
  username: string;
  email: string;
  password: string;
  position?: string;
}

export interface ApiContext {
  request: APIRequestContext;
  token: string;
  apiBaseUrl: string;
}

// ─── Video ───────────────────────────────────────────────────────────────────

export async function saveVideo(page: Page, name: string, testInfo: TestInfo) {
  if (!process.env.VIDEO) return;
  try {
    const video = page.video();
    if (!video) return;
    const newPath = testInfo.outputPath(`${name}.webm`);
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await video.saveAs(newPath);
    try {
      const originalPath = await video.path();
      if (originalPath && fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
    } catch { /* ignore */ }
  } catch (err) {
    console.error(`Failed to save video ${name}:`, err);
  }
}

// ─── Auth & Registration ─────────────────────────────────────────────────────

export async function registerUser(page: Page, user: UserData) {
  await page.goto('/register');
  await page.getByTestId('register-name').fill(user.name);
  await page.getByTestId('register-username').fill(user.username);
  await page.getByTestId('register-email').fill(user.email);
  await page.getByTestId('register-password').fill(user.password);

  if (user.position) {
    await page.getByLabel('Position').or(page.getByLabel('Posição')).click();
    await page.getByRole('option', { name: user.position }).click();
  }

  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL('/', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

export async function getApiContext(page: Page, request: APIRequestContext): Promise<ApiContext> {
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  return {
    request,
    token: token!,
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
  };
}

// ─── Organization ────────────────────────────────────────────────────────────

export async function createOrganization(page: Page, orgName: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('create-org-open-dialog').or(page.getByTestId('create-org-button')).click();
  await page.getByTestId('org-name-input').fill(orgName);
  await page.getByTestId('org-submit-button').click();

  await expect(page.getByTestId(`org-link-${orgName}`)).toBeVisible({ timeout: 15000 });
  await page.getByTestId(`org-link-${orgName}`).click();
  await expect(page).toHaveURL(/\/organizations\/\d+/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

/** Register user + create org in one call. Returns the org URL. */
export async function registerAndCreateOrg(page: Page, user: UserData, orgName: string): Promise<string> {
  await registerUser(page, user);
  await createOrganization(page, orgName);
  return page.url();
}

export function getOrgIdFromUrl(url: string): string {
  const match = url.match(/\/organizations\/(\d+)/);
  return match![1];
}

export function getPeladaIdFromUrl(url: string): string {
  return url.split('/').find((s, i, a) => a[i - 1] === 'peladas')!;
}

// ─── Invitation & Player Setup ───────────────────────────────────────────────

export async function invitePlayerByEmail(page: Page, email: string): Promise<string> {
  const inviteBtn = page.getByTestId('members-invite-button');

  // If we're already on the management page, skip navigation
  if (!await inviteBtn.isVisible()) {
    const mgmtBtn = page.getByTestId('org-management-button');
    const mgmtLink = page.getByRole('link', { name: /MANAGEMENT|GERENCIAMENTO/i });

    if (!await mgmtBtn.isVisible() && !await mgmtLink.isVisible()) {
      await page.waitForTimeout(3000);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    await mgmtBtn.or(mgmtLink).click();
  }

  await inviteBtn.click();
  await page.getByTestId('invite-email-input').fill(email);
  await page.getByTestId('send-invite-button').click();
  await expect(page.getByTestId('invite-success-alert')).toBeVisible({ timeout: 15000 });
  const link = await page.getByTestId('invitation-link-text').innerText();
  await page.getByTestId('invite-dialog-close-button').click();
  return link.trim();
}

/** Register an invited player via first-access link and accept the invitation. */
export async function setupInvitedPlayer(
  browser: Browser,
  inviteLink: string,
  player: UserData,
  orgName: string,
  videoOptions: object = {},
): Promise<void> {
  const ctx = await browser.newContext(videoOptions);
  const page = await ctx.newPage();
  await page.goto(inviteLink);
  await page.getByTestId('first-access-name').fill(player.name);
  await page.getByTestId('first-access-username').fill(player.username);
  await page.getByTestId('first-access-password').fill(player.password);
  if (player.position) {
    await page.getByTestId('first-access-position-select').click();
    await page.getByRole('option', { name: player.position }).click();
  }
  await page.getByTestId('first-access-submit').click();
  await expect(page).toHaveURL('/', { timeout: 15000 });
  await acceptPendingInvitation(page, orgName);
  await ctx.close();
}

export async function acceptPendingInvitation(page: Page, orgName: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const inviteCard = page.getByTestId(`invitation-card-${orgName}`);

  await expect(async () => {
    if (!await inviteCard.isVisible()) {
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
    await expect(inviteCard).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 15000 });

  await page.getByTestId(`accept-invitation-${orgName}`).click();

  await expect(async () => {
    const orgLink = page.getByTestId(`org-link-${orgName}`);
    if (!await orgLink.isVisible()) {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    }
    await expect(orgLink).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 15000 });

  await page.getByTestId(`org-link-${orgName}`).click();
}

/** Create players via API (faster than UI invitation flow). */
export async function createPlayerViaApi(api: ApiContext, orgId: string, name: string): Promise<number> {
  const res = await api.request.post(`${api.apiBaseUrl}/api/organizations/${orgId}/invite`, {
    data: { name },
    headers: { Authorization: `Token ${api.token}` },
  });
  const data = await res.json();
  const userId = data.user_id;

  await api.request.post(`${api.apiBaseUrl}/api/players`, {
    data: { organization_id: Number(orgId), user_id: userId, grade: 5 },
    headers: { Authorization: `Token ${api.token}` },
  });

  return userId;
}

// ─── Membership ──────────────────────────────────────────────────────────────

export async function makeMensalista(page: Page, playerName: string) {
  await page.getByTestId('org-management-button').click();
  const memberRow = page.locator('li').filter({ hasText: playerName });
  await memberRow.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Mensalista' }).click();
}

export async function addPlayerBySearch(page: Page, query: string) {
  const mgmtBtn = page.getByTestId('org-management-button').or(page.getByRole('link', { name: /MANAGEMENT|GERENCIAMENTO/i }));
  await expect(mgmtBtn).toBeVisible({ timeout: 10000 });
  await mgmtBtn.click();
  await page.getByTestId('members-add-button').click();

  const searchInput = page.locator('input[placeholder="Name / Email"]');
  await searchInput.fill(query);
  await page.waitForTimeout(1000); // Debounce
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: /Add selected|Adicionar selecionados/i }).click();
}

// ─── Pelada Lifecycle ────────────────────────────────────────────────────────

/** Creates a pelada from the org detail page. Returns the pelada ID. */
export async function createPelada(page: Page): Promise<string> {
  await page.getByTestId('create-pelada-submit').or(page.getByRole('button', { name: /Criar pelada|Create pelada/i })).click();
  await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/, { timeout: 15000 });
  return getPeladaIdFromUrl(page.url());
}

/** Confirms the current user's attendance and closes the attendance list. */
export async function confirmAndCloseAttendance(page: Page): Promise<void> {
  await page.getByTestId('attendance-confirm-button').or(page.getByTestId('attendance-card-confirm')).first().click();
  await page.getByTestId('close-attendance-button').click();
  await page.getByTestId('confirm-close-attendance-button').click();
}

/** Close attendance without confirming (for tests that don't need the owner confirmed). */
export async function closeAttendance(page: Page): Promise<void> {
  await page.getByTestId('close-attendance-button').click();
  await page.getByTestId('confirm-close-attendance-button').click();
}

/** Batch-confirm players and close attendance via API. */
export async function confirmAndCloseAttendanceViaApi(
  api: ApiContext,
  orgId: string,
  peladaId: string,
): Promise<void> {
  const playersRes = await api.request.get(`${api.apiBaseUrl}/api/organizations/${orgId}/players`, {
    headers: { Authorization: `Token ${api.token}` },
  });
  const players = await playersRes.json();

  await api.request.post(`${api.apiBaseUrl}/api/peladas/${peladaId}/attendance/batch`, {
    data: { player_ids: players.map((p: any) => p.id), status: 'confirmed' },
    headers: { Authorization: `Token ${api.token}` },
  });

  const closeRes = await api.request.put(`${api.apiBaseUrl}/api/peladas/${peladaId}`, {
    data: { status: 'open' },
    headers: { Authorization: `Token ${api.token}` },
  });
  expect(closeRes.ok()).toBeTruthy();
}

// ─── Teams & Schedule ────────────────────────────────────────────────────────

export async function setupTeams(page: Page, options: { count?: number; playersPerTeam?: number; randomize?: boolean } = {}) {
  const { count = 2, playersPerTeam, randomize = false } = options;

  for (let i = 0; i < count; i++) {
    await page.getByTestId('create-team-button').click();
    await page.waitForTimeout(300);
  }

  if (playersPerTeam) {
    const input = page.getByTestId('players-per-team-input').locator('input');
    await input.click();
    await input.fill(String(playersPerTeam));
    await page.keyboard.press('Enter');
  }

  if (randomize) {
    await page.getByTestId('randomize-teams-button').click();
    await expect(page.getByTestId('team-card-name').first()).toBeVisible({ timeout: 10000 });
  }
}

export async function buildAndSaveSchedule(page: Page) {
  await page.getByTestId('build-schedule-button').click();
  await page.getByTestId('add-match-button').click();
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });

  const saveBtn = page.getByTestId('save-schedule-button');
  await expect(saveBtn).toBeEnabled({ timeout: 15000 });
  await saveBtn.click();
  await expect(page).toHaveURL(/\/peladas\/\d+$/, { timeout: 15000 });
}

export async function startPelada(page: Page) {
  const startBtn = page.getByTestId('start-pelada-button');
  await expect(startBtn).toBeVisible({ timeout: 10000 });
  await expect(startBtn).toBeEnabled({ timeout: 10000 });
  await startBtn.click();
  await page.getByRole('button', { name: /Confirmar|Confirm/i }).click();
  await expect(page).toHaveURL(/\/peladas\/\d+\/matches/, { timeout: 15000 });
}

// ─── Composite Setup Helpers ─────────────────────────────────────────────────

/** Full setup: register, create org, create pelada, confirm attendance, close attendance. */
export async function setupOrgAndPelada(page: Page, user: UserData, orgName: string): Promise<{ orgUrl: string; peladaId: string }> {
  await registerAndCreateOrg(page, user, orgName);
  const orgUrl = page.url();

  // Navigate to org detail to create pelada
  await page.goto('/');
  await page.getByTestId(`org-link-${orgName}`).click();
  await page.waitForURL(/\/organizations\/\d+/, { timeout: 15000 });

  const peladaId = await createPelada(page);
  return { orgUrl, peladaId };
}

/** Full match-day setup: org, players, pelada, teams, schedule, start. */
export async function setupMatchDay(
  page: Page,
  browser: Browser,
  user: UserData,
  orgName: string,
  player2: UserData,
): Promise<{ peladaId: string }> {
  await registerAndCreateOrg(page, user, orgName);

  const p2Invite = await invitePlayerByEmail(page, player2.email);
  await setupInvitedPlayer(browser, p2Invite, player2, orgName);

  await page.goto('/');
  await page.getByTestId(`org-link-${orgName}`).click();
  await page.waitForURL(/\/organizations\/\d+/, { timeout: 15000 });

  const peladaId = await createPelada(page);

  // Confirm owner + confirm pending player
  await page.getByTestId('attendance-confirm-button').or(page.getByTestId('attendance-card-confirm')).first().click();
  await page.getByRole('tab', { name: /Pendente|Pending/i }).click();
  await page.getByTestId('attendance-card-confirm').first().click();

  await closeAttendance(page);

  await setupTeams(page, { count: 2, playersPerTeam: 1, randomize: true });
  await buildAndSaveSchedule(page);
  await startPelada(page);

  return { peladaId };
}
