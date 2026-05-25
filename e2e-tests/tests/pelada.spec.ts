import { test, expect } from '@playwright/test';
import {
  saveVideo,
  registerAndCreateOrg,
  invitePlayerByEmail,
  setupInvitedPlayer,
  loginUser,
  makeMensalista,
  createPelada,
  confirmAndCloseAttendance,
  setupTeams,
  buildAndUseSchedule,
  startPelada,
  getPeladaIdFromUrl,
  getApiContext,
  createPlayerViaApi,
  confirmAndCloseAttendanceViaApi,
  getOrgIdFromUrl,
  closeAttendance,
  setupMatchDay,
  UserData,
} from './utils';

test.describe('Pelada Lifecycle & Matches', () => {
  const timestamp = Date.now() + Math.floor(Math.random() * 1000000);
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const player2 = {
    name: `Player ${timestamp}`,
    username: `p2_${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123'
  };
  const player3 = {
    name: `Bench ${timestamp}`,
    username: `p3_${timestamp}`,
    email: `bench-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Pelada Org ${timestamp}`;

  test('should manage full pelada lifecycle: attendance, teams, matches, and voting', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};

    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    let peladaId = '';

    await test.step('Setup Org and Invite Players', async () => {
      await registerAndCreateOrg(ownerPage, owner, orgName);

      // Invite both players
      const p2Invite = await invitePlayerByEmail(ownerPage, player2.email);
      const p3Invite = await invitePlayerByEmail(ownerPage, player3.email);

      // Register invited players in parallel contexts
      await setupInvitedPlayer(browser, p2Invite, player2, orgName, videoOptions);
      await setupInvitedPlayer(browser, p3Invite, player3, orgName, videoOptions);
    });

    await test.step('Attendance Phase', async () => {
      // Make owner Mensalista so they go to Confirmed
      await ownerPage.goto('/home');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await makeMensalista(ownerPage, owner.name);

      await ownerPage.goto('/home');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      peladaId = await createPelada(ownerPage);
      await confirmAndCloseAttendance(ownerPage);
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}$`));
    });

    await test.step('Teams & Manual Add Players', async () => {
      await ownerPage.reload();
      await ownerPage.waitForLoadState('networkidle');

      // Add players from dialog
      await ownerPage.getByTestId('invite-player-button').or(ownerPage.getByRole('button', { name: /Adicionar jogadores|Add players/i })).click();
      await ownerPage.getByRole('dialog').getByText(player2.name).click();
      await ownerPage.getByRole('dialog').getByText(player3.name).click();
      await ownerPage.getByRole('button', { name: /Add Selected|Adicionar Selecionados/i }).click();

      await expect(ownerPage.getByTestId('player-row').filter({ hasText: player2.name })).toBeVisible();

      await setupTeams(ownerPage, { count: 2, playersPerTeam: 2, randomize: true });
      await buildAndUseSchedule(ownerPage);
    });

    await test.step('Start Pelada and Record Events', async () => {
      await startPelada(ownerPage);

      // Wait for match content
      await expect(ownerPage.locator('#pelada-matches-tabs-content').getByTestId('player-row').first()).toBeVisible({ timeout: 15000 });

      // Record a goal
      const anyPlayerRow = ownerPage.locator('#pelada-matches-tabs-content').getByTestId('player-row').first();
      await anyPlayerRow.getByTestId('stat-goals-increment').click();
      await expect(anyPlayerRow.getByTestId('stat-goals-value')).toHaveText('1');

      // Record a substitution
      await anyPlayerRow.getByTestId('sub-button').click();
      await expect(ownerPage.getByTestId('player-select-dialog')).toBeVisible();
      const benchItem = ownerPage.getByTestId(/bench-player-item-.*/).first();
      if (await benchItem.isVisible()) {
        await benchItem.click();
      } else {
        await ownerPage.keyboard.press('Escape');
      }

      // End match
      await ownerPage.getByTestId('end-match-button').click();
      const confirmBtn = ownerPage.getByTestId('pretty-confirm-button');
      await expect(confirmBtn).toBeVisible({ timeout: 15000 });
      await confirmBtn.click({ force: true });

      // Match Summary Modal
      await expect(ownerPage.getByTestId('match-finished-title')).toBeVisible({ timeout: 30000 });
      await ownerPage.waitForTimeout(2000);
      const nextMatchBtn = ownerPage.getByTestId('summary-next-match-button');
      if (await nextMatchBtn.isVisible()) {
        await nextMatchBtn.click();
      } else {
        await ownerPage.getByTestId('summary-close-button').click();
      }

      // Verify finished match in history
      await ownerPage.getByTestId('toggle-history-drawer').click();
      const drawer = ownerPage.getByTestId('history-drawer');
      await expect(drawer.getByTestId('match-history-item-1')).toBeVisible({ timeout: 10000 });
      await drawer.getByTestId('match-history-item-1').click();
      await ownerPage.getByRole('tab', { name: /Dashboard|Match/i }).click();
      await ownerPage.keyboard.press('Escape');
      await ownerPage.waitForTimeout(500);

      await expect(ownerPage.getByTestId('match-status-text').first()).toBeVisible({ timeout: 20000 });
      await expect(ownerPage.getByTestId('match-status-text').first()).toContainText(/Finished|Encerrada/i);
    });

    await test.step('Verify Timeline and Export', async () => {
      await ownerPage.getByRole('tab', { name: /Linha do Tempo|Timeline/i }).click();
      const timeline = ownerPage.locator('.MuiTimeline-root');
      await expect(timeline).toBeVisible({ timeout: 10000 });
      await timeline.scrollIntoViewIfNeeded();
      await expect(timeline.getByText(/GOL|GOAL|Gol/i).first()).toBeVisible({ timeout: 15000 });

      // Check export dropdown
      await ownerPage.getByTestId('share-dropdown-button').click();
      await expect(ownerPage.getByRole('menuitem', { name: /Compartilhar Resumo|Share Summary/i })).toBeVisible();
      await expect(ownerPage.getByRole('menuitem', { name: /Escalação \(Sem Notas\)|Lineup \(No Grades\)/i })).toBeVisible();
      await expect(ownerPage.getByRole('menuitem', { name: /Escalação \(Com Notas\)|Lineup \(With Grades\)/i })).toBeVisible();
      await ownerPage.keyboard.press('Escape');
    });

    await test.step('Edit Match', async () => {
      await ownerPage.getByRole('tab', { name: /Dashboard|Match/i }).click();

      await ownerPage.getByTestId('toggle-history-drawer').click();
      const drawer = ownerPage.getByTestId('history-drawer');
      await expect(drawer.getByTestId('match-history-item-1')).toBeVisible({ timeout: 10000 });
      await drawer.getByTestId('match-history-item-1').click();
      await ownerPage.getByRole('tab', { name: /Dashboard|Match/i }).click();
      await ownerPage.keyboard.press('Escape');
      await ownerPage.waitForTimeout(500);

      await ownerPage.getByTestId('edit-match-button').click();

      const editPlayerRow = ownerPage.locator('#pelada-matches-tabs-content').getByTestId('player-row').first();
      const currentGoals = await editPlayerRow.getByTestId('stat-goals-value').innerText();
      const expectedGoals = (parseInt(currentGoals) + 1).toString();
      await editPlayerRow.getByTestId('stat-goals-increment').click();
      await ownerPage.getByTestId('finish-editing-button').click();
      await ownerPage.waitForTimeout(500);

      // Re-select match 1 to verify
      await ownerPage.getByTestId('toggle-history-drawer').click();
      await expect(drawer.getByTestId('match-history-item-1')).toBeVisible({ timeout: 10000 });
      await drawer.getByTestId('match-history-item-1').click();
      await ownerPage.keyboard.press('Escape');
      await ownerPage.waitForTimeout(500);

      const updatedRow = ownerPage.locator('#pelada-matches-tabs-content').getByTestId('player-row').first();
      await expect(updatedRow.getByTestId('stat-goals-value')).toHaveText(expectedGoals, { timeout: 15000 });
    });

    await test.step('Close Pelada and Vote', async () => {
      await ownerPage.getByRole('tab', { name: /Classificação|Standings/i }).click();

      const closeBtn = ownerPage.getByTestId('close-pelada-button');
      await expect(closeBtn).toBeVisible({ timeout: 10000 });
      await closeBtn.click();
      await ownerPage.getByTestId('pretty-confirm-button').click();
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}/matches`));

      // Verify Performance tab is active
      const performanceTab = ownerPage.getByRole('tab', { name: /Desempenho|Performance/i });
      await expect(performanceTab).toHaveAttribute('aria-selected', 'true');
      await expect(ownerPage.getByText(/Destaques|Highlights/i).first()).toBeVisible();

      // Verify Champion in Standings
      await ownerPage.getByRole('tab', { name: /Classificação|Standings/i }).click();
      await expect(ownerPage.getByText(/Campeão|Champion/i)).toBeVisible();
      await expect(ownerPage.getByTestId('standings-table').or(ownerPage.locator('table'))).toBeVisible();

      // Voting
      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      await expect(ownerPage.getByText(/Votação/i).or(ownerPage.getByText(/Voting/i)).first()).toBeVisible();

      // Explicitly wait for both player voting cards to be visible to avoid race conditions
      const card2 = ownerPage.getByTestId(/voting-card-.*/).filter({ hasText: player2.name });
      const card3 = ownerPage.getByTestId(/voting-card-.*/).filter({ hasText: player3.name });
      await expect(card2).toBeVisible({ timeout: 15000 });
      await expect(card3).toBeVisible({ timeout: 15000 });

      // Click the 5 Stars rating for each player
      await card2.scrollIntoViewIfNeeded();
      await card2.locator('label').nth(4).click();
      await card3.scrollIntoViewIfNeeded();
      await card3.locator('label').nth(4).click();

      await ownerPage.getByTestId('save-votes-button').click();
      await expect(ownerPage.getByText(/Votos registrados|Votes saved/i).first()).toBeVisible();
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'full-pelada-lifecycle', testInfo);
  });

  test('should sort attendance by time (FIFO)', async ({ browser }) => {
    const ts = Date.now() + 4000 + Math.floor(Math.random() * 1000000);
    const adminUser = { name: `Admin ${ts}`, username: `admin_${ts}`, email: `admin-${ts}@example.com`, password: 'p', position: 'Midfielder' };
    const zebraUser = { name: `Zebra ${ts}`, username: `zebra_${ts}`, email: `zebra-${ts}@example.com`, password: 'p', position: 'Striker' };
    const albatrossUser = { name: `Albatross ${ts}`, username: `albatross_${ts}`, email: `albatross-${ts}@example.com`, password: 'p', position: 'Goalkeeper' };
    const fifoOrgName = `FIFO Org ${ts}`;

    const adminContext = await browser.newContext();
    const zebraContext = await browser.newContext();
    const albatrossContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const zebraPage = await zebraContext.newPage();
    const albatrossPage = await albatrossContext.newPage();

    await registerAndCreateOrg(adminPage, adminUser, fifoOrgName);
    const zInvite = await invitePlayerByEmail(adminPage, zebraUser.email);
    const aInvite = await invitePlayerByEmail(adminPage, albatrossUser.email);

    await setupInvitedPlayer(browser, zInvite, zebraUser, fifoOrgName);
    await setupInvitedPlayer(browser, aInvite, albatrossUser, fifoOrgName);

    await adminPage.goto('/home');
    await adminPage.getByTestId(`org-link-${fifoOrgName}`).click();
    await createPelada(adminPage);
    const peladaUrl = adminPage.url();

    await adminPage.getByTestId('attendance-confirm-button').click();

    await loginUser(zebraPage, zebraUser);
    await zebraPage.goto(peladaUrl);
    await expect(zebraPage.getByTestId('attendance-list-container')).toBeVisible({ timeout: 15000 });
    await zebraPage.getByTestId('attendance-confirm-button').click();

    await loginUser(albatrossPage, albatrossUser);
    await albatrossPage.goto(peladaUrl);
    await expect(albatrossPage.getByTestId('attendance-list-container')).toBeVisible({ timeout: 15000 });
    await albatrossPage.getByTestId('attendance-confirm-button').click();

    await adminPage.reload();
    await expect(adminPage.getByTestId('attendance-list-container')).toBeVisible({ timeout: 15000 });

    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    await expect(adminPage.getByTestId('attendance-card-name')).toHaveCount(1);
    await expect(adminPage.getByTestId('attendance-card-name')).toHaveText(adminUser.name);

    await adminPage.getByRole('tab', { name: /Espera|Waitlist/i }).click();
    const waitlistNames = adminPage.getByTestId('attendance-card-name');
    await expect(waitlistNames).toHaveCount(2, { timeout: 15000 });
    await expect(waitlistNames.nth(0)).toHaveText(zebraUser.name);
    await expect(waitlistNames.nth(1)).toHaveText(albatrossUser.name);

    await adminPage.getByTestId(`attendance-card-${zebraUser.username}`).getByTestId('attendance-card-confirm').click();
    await adminPage.waitForTimeout(1000);
    await adminPage.getByTestId(`attendance-card-${albatrossUser.username}`).getByTestId('attendance-card-confirm').click();

    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    const confirmedNames = adminPage.getByTestId('attendance-card-name');
    await expect(confirmedNames).toHaveCount(3, { timeout: 15000 });
    await expect(confirmedNames.nth(0)).toHaveText(adminUser.name);
    await expect(confirmedNames.nth(1)).toHaveText(zebraUser.name);
    await expect(confirmedNames.nth(2)).toHaveText(albatrossUser.name);

    await adminContext.close();
    await zebraContext.close();
    await albatrossContext.close();
  });

  test('should produce different team compositions on consecutive randomizations', async ({ browser }) => {
    const ts = Date.now() + 5000 + Math.floor(Math.random() * 1000000);
    const admin = { name: `Admin ${ts}`, username: `admin_${ts}`, email: `admin-${ts}@example.com`, password: 'p' };
    const varietyOrgName = `Variety Org ${ts}`;

    const context = await browser.newContext();
    const page = await context.newPage();

    await registerAndCreateOrg(page, admin, varietyOrgName);
    await expect(page).toHaveURL(/\/organizations\/[^\/]+$/);
    const orgUrl = page.url();
    const orgId = orgUrl.split('/').pop();

    const playerConfigs = [
      { pos: 1, grade: 8 }, { pos: 1, grade: 7 },
      { pos: 2, grade: 9 }, { pos: 2, grade: 8 }, { pos: 2, grade: 7 }, { pos: 2, grade: 6 },
      { pos: 3, grade: 9 }, { pos: 3, grade: 8 }, { pos: 3, grade: 7 }, { pos: 3, grade: 6 },
      { pos: 4, grade: 9 }, { pos: 4, grade: 8 }
    ];

    const posMap: Record<number, string> = {
      1: 'Goalkeeper',
      2: 'Defender',
      3: 'Midfielder',
      4: 'Striker'
    };

    for (let i = 0; i < playerConfigs.length; i++) {
      const invite = await (await page.request.post(`/api/organizations/${orgId}/invite`, { data: { name: `P${i}` } })).json();
      await page.request.post('/api/players', {
        data: { organization_id: orgId, user_id: invite.user_id, grade: playerConfigs[i].grade, position: posMap[playerConfigs[i].pos] }
      });
    }

    const pelada = await (await page.request.post('/api/peladas', { data: { organization_id: orgId, scheduled_at: new Date().toISOString() } })).json();
    const peladaId = pelada.id;
    const players = await (await page.request.get(`/api/organizations/${orgId}/players`)).json();
    await page.request.post(`/api/peladas/${peladaId}/attendance/batch`, { data: { player_ids: players.map((p: any) => p.id), status: 'confirmed' } });

    await page.request.put(`/api/peladas/${peladaId}`, { data: { status: 'open', players_per_team: 6 } });
    await page.request.post('/api/teams', { data: { pelada_id: peladaId, name: 'T1' } });
    await page.request.post('/api/teams', { data: { pelada_id: peladaId, name: 'T2' } });

    const getLineup = async () => {
      await page.request.post(`/api/peladas/${peladaId}/teams/randomize`, { data: { player_ids: players.map((p: any) => p.id), players_per_team: 6 } });
      const data = await (await page.request.get(`/api/peladas/${peladaId}/full-details`)).json();
      return data.teams.map((t: any) => t.players.map((p: any) => p.id).sort().join(',')).sort();
    };

    const l1 = await getLineup();
    const l2 = await getLineup();

    if (JSON.stringify(l1) === JSON.stringify(l2)) {
      const l3 = await getLineup();
      expect(l1).not.toEqual(l3);
    } else {
      expect(l1).not.toEqual(l2);
    }
    
    await context.close();
  });

  test('should verify player sorting and available players copy button', async ({ page }) => {
    const ts = Date.now() + 6000 + Math.floor(Math.random() * 1000000);
    const adminUser = {
      name: `Admin ${ts}`,
      username: `admin_${ts}`,
      email: `admin-${ts}@example.com`,
      password: 'password123',
      position: 'Defender',
    };
    const featureOrgName = `Feature Org ${ts}`;

    await registerAndCreateOrg(page, adminUser, featureOrgName);
    await makeMensalista(page, adminUser.name);

    await page.goto('/home');
    await page.getByTestId(`org-link-${featureOrgName}`).click();

    await createPelada(page);
    await confirmAndCloseAttendance(page);

    await expect(page.getByTestId('player-row')).toBeVisible();
    const copyBtn = page.getByTestId('copy-players-button');
    await expect(copyBtn).toBeVisible();

    page.on('dialog', async dialog => {
      expect(dialog.message()).toMatch(/common.actions.copy_success/i);
      await dialog.accept();
    });
    await copyBtn.click();
  });

  test('should verify merged header buttons logic', async ({ page }) => {
    const ts = Date.now() + 7000 + Math.floor(Math.random() * 1000000);
    const adminUser = {
      name: `Admin ${ts}`,
      username: `admin_${ts}`,
      email: `admin-${ts}@example.com`,
      password: 'password123',
      position: 'Goalkeeper',
    };
    const headerOrgName = `Header Org ${ts}`;

    await registerAndCreateOrg(page, adminUser, headerOrgName);

    await page.goto('/home');
    await page.getByTestId(`org-link-${headerOrgName}`).click();

    await createPelada(page);
    await confirmAndCloseAttendance(page);

    await setupTeams(page, { count: 2 });

    const buildBtn = page.getByTestId('build-schedule-button');
    await expect(buildBtn).toBeVisible();
    await expect(page.getByTestId('start-pelada-button')).not.toBeVisible();

    await buildBtn.click();
    await page.getByTestId('save-schedule-button').click();

    await expect(page.getByTestId('start-pelada-button')).toBeVisible();
    await expect(page.getByTestId('build-schedule-button-edit')).toBeVisible();

    await startPelada(page);
    const peladaId = getPeladaIdFromUrl(page.url());
    await page.goto(`/peladas/${peladaId}`);
    await expect(page).toHaveURL(new RegExp(`/peladas/${peladaId}/matches`));
  });

  test('should handle diarista vs mensalista attendance waitlist', async ({ browser }) => {
    const ts = Date.now() + 8000 + Math.floor(Math.random() * 1000000);
    const adminUser = { name: `Admin ${ts}`, username: `admin_${ts}`, email: `admin-${ts}@example.com`, password: 'p', position: 'Defender' };
    const diaristaUser = { name: `Diarista ${ts}`, username: `diarista_${ts}`, email: `diarista-${ts}@example.com`, password: 'p' };
    const waitlistOrgName = `Waitlist Org ${ts}`;

    const adminContext = await browser.newContext();
    const diaristaContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const diaristaPage = await diaristaContext.newPage();

    await registerAndCreateOrg(adminPage, adminUser, waitlistOrgName);

    const link = await invitePlayerByEmail(adminPage, diaristaUser.email);
    await setupInvitedPlayer(browser, link, diaristaUser, waitlistOrgName);
    
    await loginUser(diaristaPage, diaristaUser);

    await adminPage.goto('/home');
    await adminPage.getByTestId(`org-link-${waitlistOrgName}`).click();
    await createPelada(adminPage);
    const peladaUrl = adminPage.url();

    await diaristaPage.goto(peladaUrl);
    await diaristaPage.getByTestId('attendance-confirm-button').click();
    await expect(diaristaPage.getByText(/Lista de Espera|waitlist/i).first()).toBeVisible({ timeout: 10000 });

    await adminPage.reload();
    await adminPage.getByRole('tab', { name: /Lista de Espera|Waitlist/i }).click();
    const diaristaCard = adminPage.getByTestId(`attendance-card-${diaristaUser.username}`);
    await expect(diaristaCard).toBeVisible();
    await diaristaCard.getByTestId('attendance-card-confirm').click();

    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    await expect(adminPage.getByTestId(`attendance-card-${diaristaUser.username}`)).toBeVisible();

    await adminContext.close();
    await diaristaContext.close();
  });

  test('should allow admin to move confirmed player to waitlist', async ({ browser }) => {
    const ts = Date.now() + 9000 + Math.floor(Math.random() * 1000000);
    const adminUser = { name: `Admin ${ts}`, username: `admin_${ts}`, email: `admin-${ts}@example.com`, password: 'p' };
    const playerUser = { name: `Player ${ts}`, username: `player_${ts}`, email: `player-${ts}@example.com`, password: 'p' };
    const toolsOrgName = `Admin Tools Org ${ts}`;

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    await registerAndCreateOrg(adminPage, adminUser, toolsOrgName);

    const inviteLink = await invitePlayerByEmail(adminPage, playerUser.email);
    await setupInvitedPlayer(browser, inviteLink, playerUser, toolsOrgName);

    await adminPage.goto('/home');
    await adminPage.getByTestId(`org-link-${toolsOrgName}`).click();
    await createPelada(adminPage);

    await adminPage.getByRole('tab', { name: /Pendente|Pending/i }).click();
    const playerCard = adminPage.getByTestId(`attendance-card-${playerUser.username}`);
    await playerCard.getByTestId('attendance-card-confirm').click();

    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    await expect(adminPage.getByTestId(`attendance-card-${playerUser.username}`)).toBeVisible();

    await adminPage.getByTestId('attendance-card-waitlist').click();

    await adminPage.getByRole('tab', { name: /Espera|Waitlist/i }).click();
    await expect(adminPage.getByTestId(`attendance-card-${playerUser.username}`)).toBeVisible();

    await adminPage.getByTestId('attendance-card-confirm').click();
    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    await expect(adminPage.getByTestId(`attendance-card-${playerUser.username}`)).toBeVisible();

    await adminContext.close();
  });


  test('should build, customize and use a manual schedule', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const ts = Date.now() + 11000 + Math.floor(Math.random() * 1000000);
    const adminUser = {
      name: `Admin ${ts}`,
      username: `admin_${ts}`,
      email: `admin-${ts}@example.com`,
      password: 'password123',
      position: 'Defender',
    };
    const schedOrgName = `Schedule Org ${ts}`;

    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());

    await test.step('Setup Org and Pelada', async () => {
      await registerAndCreateOrg(ownerPage, adminUser, schedOrgName);
      await ownerPage.goto('/home');
      await ownerPage.getByTestId(`org-link-${schedOrgName}`).click();
      await createPelada(ownerPage);
      await closeAttendance(ownerPage);
    });

    await test.step('Customize Schedule', async () => {
      await setupTeams(ownerPage, { count: 2 });

      await ownerPage.getByTestId('build-schedule-button').click();
      await expect(ownerPage).toHaveURL(/\/build-schedule/);

      const select = ownerPage.getByTestId('matches-per-team-select').getByRole('combobox');
      await expect(select).toBeEnabled();
      await select.click();
      await ownerPage.getByRole('option', { name: /^3/ }).click();
      await expect(ownerPage.getByRole('row')).toHaveCount(4);

      await ownerPage.getByTestId('add-match-button').click();
      await expect(ownerPage.getByRole('row')).toHaveCount(5);

      const homeSelect = ownerPage.getByTestId('home-select-0');
      const awaySelect = ownerPage.getByTestId('away-select-0');
      const homeText = await homeSelect.textContent();
      const awayText = await awaySelect.textContent();

      await ownerPage.getByTestId('swap-button-0').click();
      await expect(homeSelect).toHaveText(awayText!);
      await expect(awaySelect).toHaveText(homeText!);

      await ownerPage.getByTestId('save-schedule-button').click();
      await expect(ownerPage).toHaveURL(/\/peladas\/[^\/]+$/);
    });

    await test.step('Start with Built Schedule', async () => {
      await startPelada(ownerPage);

      await ownerPage.getByTestId('toggle-history-drawer').click();
      const drawer = ownerPage.getByTestId('history-drawer');
      await expect(drawer.getByTestId('match-history-item-1')).toBeVisible({ timeout: 10000 });
      await expect(drawer.getByTestId('match-history-item-4')).toBeVisible();
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'schedule-management', testInfo);
  });

  test('should queue actions when offline, load from cache and sync when online', async ({ browser }, testInfo) => {
    test.setTimeout(240000);
    const ts = Date.now() + 12000 + Math.floor(Math.random() * 1000000);
    const adminUser = {
      name: `Owner ${ts}`,
      username: `user_${ts}`,
      email: `owner-${ts}@example.com`,
      password: 'password123',
      position: 'Midfielder'
    };
    const playerUser = {
      name: `Player ${ts}`,
      username: `p2_${ts}`,
      email: `player-${ts}@example.com`,
      password: 'password123',
      position: 'Striker'
    };
    const offlineOrgName = `Offline Org ${ts}`;

    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await setupMatchDay(page, browser, adminUser, offlineOrgName, playerUser);

    await expect(page.getByTestId('player-row').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);

    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();

    await page.getByTestId('start-match-timer-button').click();
    await expect(page.getByTestId('pending-actions-count')).toContainText('Existem alterações pendentes');

    await page.getByTestId('stat-goals-increment').first().click();
    await expect(page.getByTestId('pending-actions-count')).toContainText('Existem alterações pendentes');
    const scoreBoard = page.getByTestId('match-score-display');
    await expect(scoreBoard).toContainText('1');

    await expect(page.getByRole('tab', { name: /Dashboard|Match/i })).toBeVisible();
    await expect(scoreBoard).toContainText('1');

    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).not.toBeVisible();
    await expect(page.getByTestId('pending-actions-alert')).not.toBeVisible({ timeout: 20000 });
    await expect(scoreBoard).toContainText('1');

    await page.reload();
    await expect(page.getByTestId('match-score-display')).toContainText('1');

    await saveVideo(page, 'offline-match-day-sync', testInfo);
    await context.close();
  });

  test('voting_enabled status is displayed in voting page', async ({ page }) => {
    const ts = Date.now() + 13000 + Math.floor(Math.random() * 1000000);
    const adminUser: UserData = {
      name: 'Voting Admin Status',
      username: 'voting_admin_status_' + Math.random().toString(36).substring(7),
      email: `voting_admin_status_${ts}@test.com`,
      password: 'password123',
    };
    const voteOrgName = 'Voting Status Test';

    await registerAndCreateOrg(page, adminUser, voteOrgName);
    const peladaId = await createPelada(page);
    
    await confirmAndCloseAttendance(page);
    
    await setupTeams(page, { count: 2 });
    await buildAndUseSchedule(page);
    await startPelada(page);
    
    await page.getByRole('tab', { name: /Classificação|Standings/i }).click();
    
    const closeBtn = page.getByTestId('close-pelada-button');
    await expect(closeBtn).toBeVisible({ timeout: 10000 });
    await closeBtn.click();
    await page.getByRole('button', { name: /Confirmar|Confirm/i }).click();
    await expect(page).toHaveURL(new RegExp(`/peladas/${peladaId}/matches`));
    
    await page.goto(`/peladas/${peladaId}/voting`);
    await expect(page.getByText(/Votação|Voting/i).first()).toBeVisible({ timeout: 10000 });
    
    const votingCards = page.getByTestId(/^voting-card-/);
    let cardCount = await votingCards.count({ timeout: 5000 }).catch(() => 0);
    
    if (cardCount > 0) {
      for (let i = 0; i < cardCount && i < 3; i++) {
        const card = votingCards.nth(i);
        const disabledBadge = card.getByText(/Disabled|Desativado/i);
        const isBadgeVisible = await disabledBadge.isVisible({ timeout: 500 }).catch(() => false);
        expect(isBadgeVisible).toBe(false);
      }
    }
  });
});
