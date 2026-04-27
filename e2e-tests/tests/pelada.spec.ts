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
} from './utils';

test.describe('Pelada Lifecycle', () => {
  const timestamp = Date.now();
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

      await setupTeams(ownerPage, { count: 2, playersPerTeam: 1, randomize: true });
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
      const benchItem = ownerPage.getByTestId(/bench-player-item-\d+/).first();
      if (await benchItem.isVisible()) {
        await benchItem.click();
      } else {
        await ownerPage.keyboard.press('Escape');
      }

      // End match
      await ownerPage.getByTestId('end-match-button').click();
      await ownerPage.getByRole('button', { name: /Confirmar|Confirm/i }).click();

      // Match Summary Modal
      await expect(ownerPage.getByText(/Match Finished!|Partida Finalizada!/i)).toBeVisible({ timeout: 15000 });
      const nextMatchBtn = ownerPage.getByRole('button', { name: /Next Match|Próxima Partida/i });
      if (await nextMatchBtn.isVisible()) {
        await nextMatchBtn.click();
      } else {
        await ownerPage.getByRole('button', { name: /Close|Fechar/i }).click();
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
      await ownerPage.getByRole('button', { name: /Confirmar|Confirm/i }).click();
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

      const ratingContainers = await ownerPage.getByTestId(/rating-\d+/).all();
      for (const container of ratingContainers) {
        await container.scrollIntoViewIfNeeded();
        await container.getByRole('radio', { name: /5 Stars/i }).click({ force: true });
      }
      await ownerPage.getByTestId('save-votes-button').click();
      await expect(ownerPage.getByText(/Votos registrados|Votes saved/i).first()).toBeVisible();
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'full-pelada-lifecycle', testInfo);
  });

  test('should sort attendance by time (FIFO)', async ({ browser }) => {
    const ts = Date.now() + 4;
    const adminUser = { name: `Admin ${ts}`, username: `admin_${ts}`, email: `admin-${ts}@example.com`, password: 'p', position: 'Midfielder' };
    const zebraUser = { name: `Zebra ${ts}`, username: `zebra_${ts}`, email: `zebra-${ts}@example.com`, password: 'p', position: 'Striker' };
    const albatrossUser = { name: `Albatross ${ts}`, username: `albatross_${ts}`, email: `albatross-${ts}@example.com`, password: 'p', position: 'Goalkeeper' };
    const orgName = `FIFO Org ${ts}`;

    const adminContext = await browser.newContext();
    const zebraContext = await browser.newContext();
    const albatrossContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const zebraPage = await zebraContext.newPage();
    const albatrossPage = await albatrossContext.newPage();

    await registerAndCreateOrg(adminPage, adminUser, orgName);
    const zInvite = await invitePlayerByEmail(adminPage, zebraUser.email);
    const aInvite = await invitePlayerByEmail(adminPage, albatrossUser.email);

    await setupInvitedPlayer(browser, zInvite, zebraUser, orgName);
    await setupInvitedPlayer(browser, aInvite, albatrossUser, orgName);

    // Create pelada
    await adminPage.goto('/home');
    await adminPage.getByTestId(`org-link-${orgName}`).click();
    await createPelada(adminPage);
    const peladaUrl = adminPage.url();

    // 1. Admin confirms (first)
    await adminPage.getByTestId('attendance-confirm-button').click();

    // 2. Zebra confirms (second)
    await loginUser(zebraPage, zebraUser);
    await zebraPage.goto(peladaUrl);
    await expect(zebraPage.getByTestId('attendance-list-container')).toBeVisible({ timeout: 15000 });
    await zebraPage.getByTestId('attendance-confirm-button').click();

    // 3. Albatross confirms (third)
    await loginUser(albatrossPage, albatrossUser);
    await albatrossPage.goto(peladaUrl);
    await expect(albatrossPage.getByTestId('attendance-list-container')).toBeVisible({ timeout: 15000 });
    await albatrossPage.getByTestId('attendance-confirm-button').click();

    // Verify order on admin page (Waitlist tab since convidados go there by default)
    await adminPage.reload();
    await expect(adminPage.getByTestId('attendance-list-container')).toBeVisible({ timeout: 15000 });

    // Admin (mensalista) should be in Confirmed tab
    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    await expect(adminPage.getByTestId('attendance-card-name')).toHaveCount(1);
    await expect(adminPage.getByTestId('attendance-card-name')).toHaveText(adminUser.name);

    // Zebra and Albatross (convidados) should be in Waitlist tab
    await adminPage.getByRole('tab', { name: /Espera|Waitlist/i }).click();
    const waitlistNames = adminPage.getByTestId('attendance-card-name');
    await expect(waitlistNames).toHaveCount(2, { timeout: 15000 });
    await expect(waitlistNames.nth(0)).toHaveText(zebraUser.name);
    await expect(waitlistNames.nth(1)).toHaveText(albatrossUser.name);

    // Move them all to Confirmed to check sorting there
    await adminPage.getByTestId(`attendance-card-${zebraUser.username}`).getByTestId('attendance-card-confirm').click();
    await adminPage.getByTestId(`attendance-card-${albatrossUser.username}`).getByTestId('attendance-card-confirm').click();

    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    const confirmedNames = adminPage.getByTestId('attendance-card-name');
    await expect(confirmedNames).toHaveCount(3, { timeout: 15000 });
    // Sorting priority (from useAttendance.ts): Mensalista > Diarista > Convidado, then FIFO
    // Admin (Mensalista) > Zebra (Convidado, confirmed 2nd) > Albatross (Convidado, confirmed 3rd)
    await expect(confirmedNames.nth(0)).toHaveText(adminUser.name); // Mensalista
    await expect(confirmedNames.nth(1)).toHaveText(zebraUser.name); // Convidado (confirmed before Albatross)
    await expect(confirmedNames.nth(2)).toHaveText(albatrossUser.name); // Convidado (confirmed after Zebra)

    await adminContext.close();
    await zebraContext.close();
    await albatrossContext.close();
  });

  test('should produce different team compositions on consecutive randomizations', async ({ browser }) => {
    // This test verifies the Bucket Shuffle algorithm provides variety while being fast by using API
    const ts = Date.now() + 5;
    const admin = { name: `Admin ${ts}`, username: `admin_${ts}`, email: `admin-${ts}@example.com`, password: 'p' };
    const orgName = `Variety Org ${ts}`;

    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Setup via UI using registerAndCreateOrg (correct way)
    await registerAndCreateOrg(page, admin, orgName);
    await expect(page).toHaveURL(/\/organizations\/\d+$/);
    const orgUrl = page.url();
    const orgId = orgUrl.split('/').pop();

    // 2. Create players via API
    const playerConfigs = [
      { pos: 1, grade: 8 }, { pos: 1, grade: 7 },
      { pos: 2, grade: 9 }, { pos: 2, grade: 8 }, { pos: 2, grade: 7 }, { pos: 2, grade: 6 },
      { pos: 3, grade: 9 }, { pos: 3, grade: 8 }, { pos: 3, grade: 7 }, { pos: 3, grade: 6 },
      { pos: 4, grade: 10 }, { pos: 4, grade: 5 }
    ];

    for (let i = 0; i < playerConfigs.length; i++) {
      const invite = await (await page.request.post(`/api/organizations/${orgId}/invite`, { data: { name: `P${i}` } })).json();
      await page.request.post('/api/players', {
        data: { organization_id: Number(orgId), user_id: invite.user_id, grade: playerConfigs[i].grade, position_id: playerConfigs[i].pos }
      });
    }

    // 3. Create Pelada and Confirm Attendance
    const pelada = await (await page.request.post('/api/peladas', { data: { organization_id: Number(orgId), scheduled_at: new Date().toISOString() } })).json();
    const peladaId = pelada.id;
    const players = await (await page.request.get(`/api/organizations/${orgId}/players`)).json();
    await page.request.post(`/api/peladas/${peladaId}/attendance/batch`, { data: { player_ids: players.map((p: any) => p.id), status: 'confirmed' } });

    // 4. Open Pelada, set players_per_team, and create 2 teams
    await page.request.put(`/api/peladas/${peladaId}`, { data: { status: 'open', players_per_team: 6 } });
    await page.request.post('/api/teams', { data: { pelada_id: peladaId, name: 'T1' } });
    await page.request.post('/api/teams', { data: { pelada_id: peladaId, name: 'T2' } });

    // 5. Randomize twice and compare
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
});
