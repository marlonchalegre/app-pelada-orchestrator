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
  phone?: string;
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

export async function loginUser(page: Page, user: UserData) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.username);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/home/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

export async function registerUser(page: Page, user: UserData) {
  await page.goto('/register');
  await page.getByTestId('register-name').fill(user.name);
  await page.getByTestId('register-username').fill(user.username);
  await page.getByTestId("register-email").fill(user.email);

  if (user.phone) {
    await page.getByTestId("register-phone").fill(user.phone);
  }

  await page.getByTestId("register-password").fill(user.password);

  if (user.position) {
    await page.getByLabel('Position').or(page.getByLabel('Posição')).click();
    await page.getByRole('option', { name: user.position }).click();
  }

  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL('/home', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

export async function getApiContext(page: Page, _request: APIRequestContext): Promise<ApiContext> {
  // Try to get token from localStorage first (might still be there in some flows or dev)
  let token = await page.evaluate(() => localStorage.getItem('authToken'));

  if (!token) {
    const cookies = await page.context().cookies();
    const authCookie = cookies.find(c => c.name === 'authToken');
    token = authCookie?.value || '';
  }

  return {
    request: page.request, // ALWAYS use page.request for shared cookies
    token: token!,
    apiBaseUrl: '', // Use relative paths to take advantage of cookies
  };
}
// ─── Organization ────────────────────────────────────────────────────────────

export async function createOrganization(page: Page, orgName: string) {
  await page.goto('/home');
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
  
  // The UI displays the token/link in 'invitation-link-text'
  const linkText = await page.getByTestId('invitation-link-text').innerText();
  await page.getByTestId('invite-dialog-close-button').click();
  
  const rawText = linkText.trim();
  let token = '';
  
  if (rawText.includes('token=')) {
    const match = rawText.match(/[?&]token=([^&?#]+)/);
    if (match) token = match[1];
  } else if (rawText.includes('t=')) {
    const match = rawText.match(/[?&]t=([^&?#]+)/);
    if (match) token = match[1];
  } else if (rawText.startsWith('http')) {
    try {
      const url = new URL(rawText);
      token = url.searchParams.get('token') || url.searchParams.get('t') || '';
      if (!token) {
        const segments = url.pathname.split('/').filter(s => s !== '');
        const last = segments.pop();
        if (last && last !== 'first-access') token = last;
      }
    } catch (e) {
      const parts = rawText.split('/').filter(s => s !== '');
      const last = parts.pop() || '';
      token = last.split('?')[0];
    }
  } else {
    token = rawText;
  }
  
  // Cleanup if we somehow took 'first-access' as token
  if (token === 'first-access') token = '';

  // Return the relative link with ONLY the clean token
  return `/first-access?token=${token}&email=${encodeURIComponent(email)}`;
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
  
  // Navigate to the invite link (relative or absolute)
  await page.goto(inviteLink);
  
  // Robust wait for form
  await expect(page.getByTestId('first-access-name')).toBeVisible({ timeout: 15000 });
  
  // Extra check: ensure we didn't end up on a broken URL
  const currentUrl = page.url();

  await page.getByTestId('first-access-name').fill(player.name);
  await page.getByTestId('first-access-username').fill(player.username);
  await page.getByTestId('first-access-password').fill(player.password);
  
  if (player.position) {
    const posLabel = page.getByTestId('first-access-position-select');
    if (await posLabel.isVisible()) {
      await posLabel.click();
      await page.getByRole('option', { name: player.position }).click();
    }
  }

  await page.getByTestId('first-access-submit').click();
  
  // Wait for success and redirect
  try {
    await expect(page).toHaveURL(/\/home/, { timeout: 20000 });
  } catch (e) {
    throw e;
  }
  
  await acceptPendingInvitation(page, orgName);
  await ctx.close();
}

export async function acceptPendingInvitation(page: Page, orgName: string) {
  await page.goto('/home');
  await page.waitForLoadState('networkidle');

  const orgLink = page.getByTestId(`org-link-${orgName}`);
  const inviteCard = page.getByTestId(`invitation-card-${orgName}`);

  await expect(async () => {
    if (!(await inviteCard.isVisible()) && !(await orgLink.isVisible())) {
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
    expect(await inviteCard.isVisible() || await orgLink.isVisible()).toBeTruthy();
  }).toPass({ timeout: 15000 });

  if (await inviteCard.isVisible()) {
    await page.getByTestId(`accept-invitation-${orgName}`).click();
    await expect(async () => {
      if (!await orgLink.isVisible()) {
        await page.goto('/home');
        await page.waitForLoadState('networkidle');
      }
      await expect(orgLink).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 15000 });
  }

  await orgLink.click();
}

/** Create players via API (faster than UI invitation flow). */
export async function createPlayerViaApi(api: ApiContext, orgId: string, name: string): Promise<number> {
  const res = await api.request.post(`${api.apiBaseUrl}/api/organizations/${orgId}/invite`, {
    data: { name },
  });
  const data = await res.json();
  const userId = data.user_id;

  await api.request.post(`${api.apiBaseUrl}/api/players`, {
    data: { organization_id: Number(orgId), user_id: userId, grade: 5 },
  });

  return userId;
}

// ─── Membership ──────────────────────────────────────────────────────────────

export async function makeMensalista(page: Page, playerName: string) {
  const mgmtBtn = page.getByTestId('org-management-button');
  const mgmtContainer = page.getByTestId('org-mgmt-container');
  
  if (!await mgmtContainer.isVisible()) {
    await mgmtBtn.click();
    await expect(page.getByTestId('org-mgmt-container')).toBeVisible({ timeout: 10000 });
  }
  
  // Make sure we are on the members tab (default)
  const membersTab = page.getByTestId('mgmt-tab-members');
  if (await membersTab.isVisible()) {
    await membersTab.click();
  }

  const memberRow = page.locator('li').filter({ hasText: playerName });
  await expect(memberRow).toBeVisible({ timeout: 10000 });
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
  const playersRes = await api.request.get(`${api.apiBaseUrl}/api/organizations/${orgId}/players`);
  if (!playersRes.ok()) {
    throw new Error(`Failed to fetch players: ${playersRes.status()} ${await playersRes.text()}`);
  }
  const players = await playersRes.json();

  await api.request.post(`${api.apiBaseUrl}/api/peladas/${peladaId}/attendance/batch`, {
    data: { player_ids: players.map((p: any) => p.id), status: 'confirmed' },
  });

  const closeRes = await api.request.put(`${api.apiBaseUrl}/api/peladas/${peladaId}`, {
    data: { status: 'open' },
  });
  if (!closeRes.ok()) {
    throw new Error(`Failed to close attendance: ${closeRes.status()} ${await closeRes.text()}`);
  }
}

// ─── Teams & Schedule ────────────────────────────────────────────────────────

export async function setupTeams(page: Page, options: { count?: number; playersPerTeam?: number; randomize?: boolean } = {}) {
  const { count = 2, playersPerTeam, randomize = false } = options;

  // Use the placeholder button to create teams
  for (let i = 0; i < count; i++) {
    await page.getByText(/Adicionar Time|Add Team/i).first().click();
    await page.waitForTimeout(300);
  }

  if (playersPerTeam) {
    const perTeamValueLoc = page.locator('text=/PER TEAM|POR TIME/i').locator('xpath=..').locator('h6');
    let currentValueStr = await perTeamValueLoc.innerText();
    let currentValue = parseInt(currentValueStr, 10);

    const incrementBtn = page.getByTestId('players-per-team-increment');
    const decrementBtn = page.getByTestId('players-per-team-decrement');

    while (currentValue < playersPerTeam) {
      await incrementBtn.click();
      await page.waitForTimeout(200);
      currentValue++;
    }
    while (currentValue > playersPerTeam) {
      await decrementBtn.click();
      await page.waitForTimeout(200);
      currentValue--;
    }
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
  await page.goto('/home');
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

  await page.goto('/home');
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
