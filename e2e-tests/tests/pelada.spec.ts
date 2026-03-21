import { test, expect } from '@playwright/test';
import {
  saveVideo,
  registerAndCreateOrg,
  invitePlayerByEmail,
  setupInvitedPlayer,
  makeMensalista,
  createPelada,
  confirmAndCloseAttendance,
  setupTeams,
  buildAndSaveSchedule,
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
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await makeMensalista(ownerPage, owner.name);

      await ownerPage.goto('/');
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
      await buildAndSaveSchedule(ownerPage);
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
});
