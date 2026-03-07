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
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());

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
      await ownerPage.keyboard.press('Escape');

      // Invite P3
      await ownerPage.getByTestId('members-invite-button').click();
      await ownerPage.getByTestId('invite-email-input').fill(player3.email);
      await ownerPage.getByTestId('send-invite-button').click();
      const p3Invite = await ownerPage.getByTestId('invitation-link-text').innerText();
      await ownerPage.keyboard.press('Escape');

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

    let peladaId = '';

    // 2. Attendance
    await test.step('Attendance Phase', async () => {
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await ownerPage.getByTestId('create-pelada-submit').click();
      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/attendance/);
      peladaId = ownerPage.url().split('/').find((s, i, a) => a[i-1] === 'peladas')!;

      await ownerPage.getByTestId('attendance-confirm-button').or(ownerPage.getByTestId('attendance-card-confirm')).first().click();
      // Instead of stats-confirmed-count, we can check for the success message in the header
      await expect(ownerPage.getByText(/You're in!|Confirmado!/i)).toBeVisible();

      await ownerPage.getByTestId('close-attendance-button').click();
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}$`));
    });

    // 3. Teams & "Add Players" Feature
    await test.step('Teams & Manual Add Players', async () => {
      await ownerPage.reload();
      await ownerPage.waitForTimeout(2000);

      // Add Players who didn't confirm attendance - This button is now only in PeladaDetailPage
      await ownerPage.getByTestId('invite-player-button').or(ownerPage.getByRole('button', { name: /\+ Adicionar jogadores|\+ Add players/i })).click();
      await ownerPage.getByRole('dialog').getByText(player2.name).click();
      await ownerPage.getByRole('dialog').getByText(player3.name).click();
      await ownerPage.getByRole('button', { name: /Add Selected|Adicionar Selecionados/i }).click();
      await expect(ownerPage.getByTestId('player-row').filter({ hasText: player2.name })).toBeVisible();

      // Create teams
      await ownerPage.getByTestId('create-team-button').click();
      await ownerPage.getByTestId('create-team-button').click();

      // Set players per team to 1. With 3 players, 1 will be on the bench.
      const input = ownerPage.getByTestId('players-per-team-input').locator('input');
      await input.click();
      await input.fill('1');
      await ownerPage.keyboard.press('Enter');
      
      await ownerPage.getByTestId('randomize-teams-button').click();
      await expect(ownerPage.getByTestId('team-card-name').first()).toBeVisible();
    });

    // 4. Matches & Events
    await test.step('Start Pelada and Record Events', async () => {
      await ownerPage.getByTestId('start-pelada-button').click();
      await expect(ownerPage.getByTestId('confirm-start-pelada-button')).toBeVisible({ timeout: 10000 });
      await ownerPage.getByTestId('confirm-start-pelada-button').click();
      
      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/matches/);
      // Wait for matches to load
      await expect(ownerPage.getByTestId('player-row').first()).toBeVisible({ timeout: 15000 });

      // Record a goal
      const ownerRow = ownerPage.getByTestId('player-row').filter({ hasText: owner.name });
      await ownerRow.getByTestId('stat-goals-increment').click();
      await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('1');

      // Record a substitution
      await ownerRow.getByTestId('sub-button').click();
      await expect(ownerPage.getByTestId('sub-menu')).toBeVisible();
      // Click first bench player if available, else just close
      const benchItem = ownerPage.getByTestId('bench-player-item').first();
      if (await benchItem.isVisible()) {
        await benchItem.click();
      } else {
        await ownerPage.keyboard.press('Escape');
      }
      
      // End match (handles dialog automatically)
      await ownerPage.getByTestId('end-match-button').click();
      
      // If there are more matches, it might auto-switch to next one.
      // We'll select Match 1 again just to be sure we are verifying the right one.
      await ownerPage.getByTestId('match-history-item-1').click();
      
      await expect(ownerPage.getByTestId('match-status-text').first()).toBeVisible({ timeout: 20000 });
      await expect(ownerPage.getByTestId('match-status-text').first()).toContainText(/Finished|Encerrada/i);
    });

    // 5. Edit Finished Match
    await test.step('Edit Match', async () => {
      await ownerPage.getByTestId('match-history-item-1').click();
      await ownerPage.getByTestId('edit-match-button').click();
      
      // Find the player row for player 2 (who should be in the away team if owner is in home)
      const p2Row = ownerPage.getByTestId('player-row').filter({ hasText: player2.name });
      await p2Row.getByTestId('stat-goals-increment').click();
      
      await ownerPage.getByTestId('finish-editing-button').click();
      await expect(p2Row.getByTestId('stat-goals-value')).toHaveText('1');
    });

    // 6. Close Pelada & Voting
    await test.step('Close Pelada and Vote', async () => {
      await ownerPage.getByTestId('close-pelada-button').click();
      await expect(ownerPage.getByText(/Pelada closed|Pelada encerrada/i)).toBeVisible({ timeout: 15000 });

      // Navigate to voting page
      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      
      await expect(ownerPage.getByText(/Rate the players|Avalie os jogadores|Voting for Pelada/i)).toBeVisible({ timeout: 15000 });
      
      const ratingCards = await ownerPage.getByTestId(/voting-card-\d+/).all();
      for (const card of ratingCards) {
        // Find the 4-star radio button or its label
        await card.getByRole('radio', { name: '4 Stars' }).click({ force: true });
      }

      await ownerPage.getByTestId('submit-votes-button').click();
      await expect(ownerPage.getByText(/Votes saved successfully|Votos registrados com sucesso/i)).toBeVisible();
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'full-pelada-lifecycle', testInfo);
  });
});
