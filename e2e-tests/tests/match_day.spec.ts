import { test, expect } from '@playwright/test';
import { saveVideo, acceptPendingInvitation } from './utils';

test.describe('Phase 4: Match Day', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    email: `match-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Match Org ${timestamp}`;
  
  const invitedUser = {
    name: `Player ${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123'
  };

  test('should record match events and close pelada', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const ownerContext = await browser.newContext(videoOptions);
    const invitedContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    
    // Handle confirms automatically
    ownerPage.on('dialog', dialog => dialog.accept());

    await test.step('Setup Owner and Org', async () => {
      await ownerPage.goto('/register');
      await ownerPage.getByTestId('register-name').fill(owner.name);
      await ownerPage.getByTestId('register-username').fill(`user_${timestamp}`);
      await ownerPage.getByTestId('register-email').fill(owner.email);
      await ownerPage.getByTestId('register-password').fill(owner.password);
      await ownerPage.getByLabel('Position').click();
      await ownerPage.getByRole('option', { name: 'Defender' }).click();
      await ownerPage.getByTestId('register-submit').click();
      
      await ownerPage.getByTestId('create-org-open-dialog').click();
      await ownerPage.getByTestId('org-name-input').fill(orgName);
      await ownerPage.getByTestId('org-submit-button').click();
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      
      const orgId = ownerPage.url().split('/').pop();
      (owner as any).orgId = orgId;
    });

    await test.step('Invite and Register Player', async () => {
      await ownerPage.getByTestId('org-management-button').click();
      await ownerPage.getByTestId('members-invite-button').click();
      await ownerPage.getByTestId('invite-email-input').fill(invitedUser.email);
      await ownerPage.getByTestId('send-invite-button').click();
      
      const invitationLinkLocator = ownerPage.getByTestId('invitation-link-text');
      await invitationLinkLocator.waitFor({ state: 'visible' });
      const invitationLinkText = await invitationLinkLocator.innerText();

      const invitedPage = await invitedContext.newPage();
      (invitedUser as any).page = invitedPage; // Keep reference for saveVideo
      await invitedPage.goto(invitationLinkText);
      await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
      await invitedPage.getByTestId('first-access-username').fill(`user_invited_${timestamp}`);
      await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
      await invitedPage.getByLabel('Position').click();
      await invitedPage.getByRole('option', { name: 'Striker' }).click();
      await invitedPage.getByTestId('first-access-submit').click();
      await expect(invitedPage).toHaveURL('/');
      
      // NEW: Accept invitation
      await acceptPendingInvitation(invitedPage, orgName);
      await invitedPage.close();

      // IMPORTANT: Verify the player is actually in the org members list before proceeding
      // This ensures the backend transaction is complete and the player has access rights
      const orgId = (owner as any).orgId;
      await ownerPage.goto(`/organizations/${orgId}/management`);
      await expect(ownerPage.locator('li').filter({ hasText: invitedUser.name })).toBeVisible({ timeout: 10000 });
    });

    await test.step('Create Pelada and Confirm Attendance', async () => {
      const orgId = (owner as any).orgId;
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      
      await ownerPage.getByTestId('create-pelada-submit').click();
      
      // Wait for navigation to attendance page to ensure creation is complete
      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/attendance/, { timeout: 15000 });
      const peladaId = ownerPage.url().split('/').find((s, i, a) => a[i-1] === 'peladas');

      await ownerPage.getByTestId('attendance-confirm-button').click();
      await expect(ownerPage.getByTestId('stats-confirmed-count')).toHaveText('1');

      const invitedPage = await invitedContext.newPage();
      // Go directly to the organization page
      await invitedPage.goto(`/organizations/${orgId}`);
      
      // Wait for any pelada row to appear then click it
      const peladaRow = invitedPage.getByTestId('pelada-row').first();
      await expect(async () => {
        if (!await peladaRow.isVisible()) {
          await invitedPage.reload();
        }
        await expect(peladaRow).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 20000 });
      
      // Click the link inside the row
      await peladaRow.locator('a').first().click();
      await invitedPage.getByTestId('attendance-confirm-button').click();
      await expect(invitedPage.getByTestId('stats-confirmed-count')).toHaveText('2');
      await invitedPage.close();
    });

    await test.step('Start Match and Record Events', async () => {
      await ownerPage.reload();
      await ownerPage.waitForTimeout(2000);
      await ownerPage.getByTestId('close-attendance-button').click();
      
      await ownerPage.reload();
      await ownerPage.waitForTimeout(2000);
      await ownerPage.getByTestId('randomize-teams-button').click();
      await ownerPage.getByTestId('start-pelada-button').click();
      await ownerPage.getByTestId('confirm-start-pelada-button').click();

      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/matches/);
      
      const ownerRow = ownerPage.getByTestId(`player-row-${owner.name}`);
      await ownerRow.getByTestId('stat-goals-increment').click();
      await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('1');
      
      const playerRow = ownerPage.getByTestId(`player-row-${invitedUser.name}`);
      await playerRow.getByTestId('stat-goals-increment').click();
      await playerRow.getByTestId('stat-assists-increment').click();
      await expect(playerRow.getByTestId('stat-goals-value')).toHaveText('1');
      await expect(playerRow.getByTestId('stat-assists-value')).toHaveText('1');

      await ownerPage.getByTestId('end-match-button').click();
      await ownerPage.getByText(/Seq 1:/).first().click();
      await expect(ownerPage.getByTestId('match-status-text')).toBeVisible({ timeout: 10000 });

      await ownerPage.getByTestId('close-pelada-button').click();
      await expect(ownerPage.getByText(/Pelada closed|Pelada encerrada/i)).toBeVisible({ timeout: 10000 });
    });

    await invitedContext.close();
    await ownerContext.close();
    
    await saveVideo((invitedUser as any).page, 'invited-player-match-day', testInfo);
    await saveVideo(ownerPage, 'owner-match-day', testInfo);
  });
});
