import { test, expect } from '@playwright/test';
import { saveVideo, acceptPendingInvitation } from './utils';

test.describe('Pelada Lifecycle', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123'
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
    const player2Context = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    const p2Page = await player2Context.newPage();

    let peladaId = '';

    // 1. Setup Organization and Invite Players
    await test.step('Setup Org and Invite Players', async () => {
      await ownerPage.goto('/register');
      await ownerPage.getByTestId('register-name').fill(owner.name);
      await ownerPage.getByTestId('register-username').fill(owner.username);
      await ownerPage.getByTestId('register-email').fill(owner.email);
      await ownerPage.getByTestId('register-password').fill(owner.password);
      await ownerPage.getByLabel('Position').click();
      await ownerPage.getByRole('option', { name: 'Defender' }).click();
      await ownerPage.getByTestId('register-submit').click();

      await ownerPage.getByTestId('create-org-open-dialog').click();
      await ownerPage.getByTestId('org-name-input').fill(orgName);
      await ownerPage.getByTestId('org-submit-button').click();
      await ownerPage.getByTestId(`org-link-${orgName}`).click();

      // Invite P2
      await ownerPage.getByTestId('org-management-button').click();
      await ownerPage.getByTestId('members-invite-button').click();
      await ownerPage.getByTestId('invite-email-input').fill(player2.email);
      await ownerPage.getByTestId('send-invite-button').click();
      const p2Invite = await ownerPage.getByTestId('invitation-link-text').innerText();
      await ownerPage.getByTestId('invite-dialog-close-button').click();

      // Invite P3
      await ownerPage.getByTestId('members-invite-button').click();
      await ownerPage.getByTestId('invite-email-input').fill(player3.email);
      await ownerPage.getByTestId('send-invite-button').click();
      const p3Invite = await ownerPage.getByTestId('invitation-link-text').innerText();
      await ownerPage.getByTestId('invite-dialog-close-button').click();

      const p2Context = await browser.newContext(videoOptions);
      const p2Page = await p2Context.newPage();
      await p2Page.goto(p2Invite);
      await p2Page.getByTestId('first-access-name').fill(player2.name);
      await p2Page.getByTestId('first-access-username').fill(player2.username);
      await p2Page.getByTestId('first-access-password').fill(player2.password);
      await p2Page.getByTestId('first-access-submit').click();
      await acceptPendingInvitation(p2Page, orgName);
      await p2Context.close();

      const p3Context = await browser.newContext(videoOptions);
      const p3Page = await p3Context.newPage();
      await p3Page.goto(p3Invite);
      await p3Page.getByTestId('first-access-name').fill(player3.name);
      await p3Page.getByTestId('first-access-username').fill(player3.username);
      await p3Page.getByTestId('first-access-password').fill(player3.password);
      await p3Page.getByTestId('first-access-submit').click();
      await acceptPendingInvitation(p3Page, orgName);
      await p3Context.close();
    });

    // 2. Attendance
    await test.step('Attendance Phase', async () => {
      // First make the owner a Mensalista so they go to Confirmed instead of Waitlist
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await ownerPage.getByTestId('org-management-button').click();
      const memberRow = ownerPage.locator('li').filter({ hasText: owner.name });
      await memberRow.getByRole('combobox').click();
      await ownerPage.getByRole('option', { name: 'Mensalista' }).click();
      
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await ownerPage.getByTestId('create-pelada-submit').click();
      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/attendance/);
      peladaId = ownerPage.url().split('/').find((s, i, a) => a[i-1] === 'peladas')!;

      await ownerPage.getByTestId('attendance-confirm-button').or(ownerPage.getByTestId('attendance-card-confirm')).first().click();
      await expect(ownerPage.getByText(/You're in!|Confirmado!/i)).toBeVisible();

      await ownerPage.getByTestId('close-attendance-button').click();
      await ownerPage.getByTestId('confirm-close-attendance-button').click();
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}$`));
    });

    // 3. Teams & "Add Players" Feature
    await test.step('Teams & Manual Add Players', async () => {
      await ownerPage.reload();
      await ownerPage.waitForTimeout(2000);

      await ownerPage.getByTestId('invite-player-button').or(ownerPage.getByRole('button', { name: /Adicionar jogadores|Add players/i })).click();
      await ownerPage.getByRole('dialog').getByText(player2.name).click();
      await ownerPage.getByRole('dialog').getByText(player3.name).click();
      await ownerPage.getByRole('button', { name: /Add Selected|Adicionar Selecionados/i }).click();
      
      const p2DetailRow = ownerPage.getByTestId('player-row').filter({ hasText: player2.name });
      await expect(p2DetailRow).toBeVisible();

      // Create teams
      await ownerPage.getByTestId('create-team-button').click();
      await ownerPage.getByTestId('create-team-button').click();

      // Set players per team to 1
      const input = ownerPage.getByTestId('players-per-team-input').locator('input');
      await input.click();
      await input.fill('1');
      await ownerPage.keyboard.press('Enter');
      
      await ownerPage.getByTestId('randomize-teams-button').click();
      await expect(ownerPage.getByTestId('team-card-name').first()).toBeVisible();

      // Build Schedule
      await ownerPage.getByTestId('build-schedule-button').click();
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}/build-schedule`));
      await ownerPage.waitForTimeout(2000);
      await ownerPage.getByTestId('add-match-button').click();
      await expect(ownerPage.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
      
      const saveBtn = ownerPage.getByTestId('save-schedule-button');
      await expect(saveBtn).toBeEnabled({ timeout: 15000 });
      await saveBtn.click();
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}$`));
    });

    // 4. Matches & Events
    await test.step('Start Pelada and Record Events', async () => {
      // Ensure we are on detail page
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}$`));

      // Click start button
      const startBtn = ownerPage.getByTestId('start-pelada-button');
      await expect(startBtn).toBeVisible({ timeout: 10000 });
      await expect(startBtn).toBeEnabled({ timeout: 10000 });
      await startBtn.click();

      // Handle the pretty confirm dialog
      await ownerPage.getByRole('button', { name: /Confirmar|Confirm/i }).click();

      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/matches/);
      // Wait for matches to load
      await expect(ownerPage.locator('#pelada-matches-tabs-content').getByTestId('player-row').first()).toBeVisible({ timeout: 15000 });

      // Record a goal for ANY player that is currently in the match
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
      
      // History selection
      await ownerPage.getByTestId('toggle-history-drawer').click();
      const drawer = ownerPage.getByTestId('history-drawer');
      await ownerPage.waitForTimeout(1000);
      await drawer.getByTestId('match-history-item-1').click();
      
      // Ensure we are on Dashboard tab
      await ownerPage.getByRole('tab', { name: /Dashboard|Match/i }).click();

      // CLOSE DRAWER
      await ownerPage.keyboard.press('Escape');
      await ownerPage.waitForTimeout(1000);
      
      await expect(ownerPage.getByTestId('match-status-text').first()).toBeVisible({ timeout: 20000 });
      await expect(ownerPage.getByTestId('match-status-text').first()).toContainText(/Finished|Encerrada/i);
    });

    // 5. Verify Timeline and Export
    await test.step('Verify Timeline and Export', async () => {
      // Check Timeline tab
      await ownerPage.getByRole('tab', { name: /Linha do Tempo|Timeline/i }).click();
      
      // Should see the goal we recorded earlier
      const timeline = ownerPage.locator('.MuiTimeline-root');
      await expect(timeline).toBeVisible({ timeout: 10000 });
      
      // Ensure we scroll to see the content if needed
      await timeline.scrollIntoViewIfNeeded();
      
      // MUI Timeline might take a moment to animate/render
      await expect(timeline.getByText(/GOL|GOAL|Gol/i).first()).toBeVisible({ timeout: 15000 });

      // Check Export dropdown
      await ownerPage.getByTestId('share-dropdown-button').click();
      await expect(ownerPage.getByRole('menuitem', { name: /Compartilhar Resumo|Share Summary/i })).toBeVisible();
      await expect(ownerPage.getByRole('menuitem', { name: /Escalação \(Sem Notas\)|Lineup \(No Grades\)/i })).toBeVisible();
      await expect(ownerPage.getByRole('menuitem', { name: /Escalação \(Com Notas\)|Lineup \(With Grades\)/i })).toBeVisible();
      
      // Close menu
      await ownerPage.keyboard.press('Escape');
    });

    // 6. Edit Finished Match
    await test.step('Edit Match', async () => {
      // Ensure Dashboard tab is selected (history drawer toggle is there)
      await ownerPage.getByRole('tab', { name: /Dashboard|Match/i }).click();

      // Re-select match 1 from history
      await ownerPage.getByTestId('toggle-history-drawer').click();
      const drawer = ownerPage.getByTestId('history-drawer');
      await ownerPage.waitForTimeout(1000);
      await drawer.getByTestId('match-history-item-1').click();
      
      await ownerPage.getByRole('tab', { name: /Dashboard|Match/i }).click();

      // CLOSE DRAWER
      await ownerPage.keyboard.press('Escape');
      await ownerPage.waitForTimeout(1000);
      
      await ownerPage.getByTestId('edit-match-button').click();
      
      // Find ANY player row in the finished match to increment goal
      const editPlayerRow = ownerPage.locator('#pelada-matches-tabs-content').getByTestId('player-row').first();
      const currentGoals = await editPlayerRow.getByTestId('stat-goals-value').innerText();
      const expectedGoals = (parseInt(currentGoals) + 1).toString();
      
      await editPlayerRow.getByTestId('stat-goals-increment').click();
      
      await ownerPage.getByTestId('finish-editing-button').click();
      await ownerPage.waitForTimeout(1000);
      
      // RE-SELECT MATCH 1 AGAIN
      await ownerPage.getByTestId('toggle-history-drawer').click();
      await ownerPage.waitForTimeout(1000);
      await drawer.getByTestId('match-history-item-1').click();
      
      // CLOSE DRAWER
      await ownerPage.keyboard.press('Escape');
      await ownerPage.waitForTimeout(1000);

      const editPlayerRowUpdated = ownerPage.locator('#pelada-matches-tabs-content').getByTestId('player-row').first();
      await expect(editPlayerRowUpdated.getByTestId('stat-goals-value')).toHaveText(expectedGoals, { timeout: 15000 });
    });

    // 7. Close Pelada & Voting
    await test.step('Close Pelada and Vote', async () => {
      await ownerPage.getByRole('tab', { name: /Classificação|Standings/i }).click();

      const closeBtn = ownerPage.getByTestId('close-pelada-button');
      await expect(closeBtn).toBeVisible({ timeout: 10000 });
      await closeBtn.click();

      await ownerPage.getByRole('button', { name: /Confirmar|Confirm/i }).click();
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}/matches`));

      // 1. Verify automatic tab switch to Performance (index 2)
      // The Performance tab should have the aria-selected="true" attribute
      const performanceTab = ownerPage.getByRole('tab', { name: /Desempenho|Performance/i });
      await expect(performanceTab).toHaveAttribute('aria-selected', 'true');

      // 2. Verify Performance Highlights (Destaques) now visible
      await expect(ownerPage.getByText(/Destaques|Highlights/i).first()).toBeVisible();

      // 3. Verify Champion Highlight in Standings tab
      await ownerPage.getByRole('tab', { name: /Classificação|Standings/i }).click();
      await expect(ownerPage.getByText(/Campeão|Champion/i)).toBeVisible();
      // Should show one of the teams as champion
      await expect(ownerPage.getByTestId('standings-table').or(ownerPage.locator('table'))).toBeVisible();

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
    await player2Context.close();
    await saveVideo(ownerPage, 'full-pelada-lifecycle', testInfo);
  });
});
