import { test, expect } from '@playwright/test';
import { acceptPendingInvitation, saveVideo } from './utils';

test.describe('Edit Match Feature', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `owner_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
  };
  const player2 = {
    name: `Player 2 ${timestamp}`,
    username: `player2_${timestamp}`,
    email: `player2-${timestamp}@example.com`,
    password: 'password123',
  };
  const player3 = {
    name: `Player 3 ${timestamp}`,
    username: `player3_${timestamp}`,
    email: `player3-${timestamp}@example.com`,
    password: 'password123',
  };
  const orgName = `Edit Match Club ${timestamp}`;

  test('should allow editing a finished match and auto-select next', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    
    // Create Owner context
    const ownerContext = await browser.newContext(videoOptions);
    const page = await ownerContext.newPage();
    page.on('dialog', dialog => dialog.accept());

    try {
      await test.step('Setup: Register and Create Organization', async () => {
        await page.goto('/register');
        await page.getByTestId('register-name').fill(owner.name);
        await page.getByTestId('register-username').fill(owner.username);
        await page.getByTestId('register-email').fill(owner.email);
        await page.getByTestId('register-password').fill(owner.password);
        await page.getByTestId('register-submit').click();
        await expect(page).toHaveURL('/');

        await page.getByTestId('create-org-open-dialog').click();
        await page.getByTestId('org-name-input').fill(orgName);
        await page.getByTestId('org-submit-button').click();
        
        const orgLink = page.getByTestId(`org-link-${orgName}`);
        await expect(orgLink).toBeVisible();
        await orgLink.click();
        await expect(page).toHaveURL(/\/organizations\/\d+/);
      });

      const orgId = page.url().split('/').pop();

      // Register player 2 and 3 and join
      const p2Context = await browser.newContext(videoOptions);
      const p2Page = await p2Context.newPage();
      await p2Page.goto('/register');
      await p2Page.getByTestId('register-name').fill(player2.name);
      await p2Page.getByTestId('register-username').fill(player2.username);
      await p2Page.getByTestId('register-email').fill(player2.email);
      await p2Page.getByTestId('register-password').fill(player2.password);
      await p2Page.getByTestId('register-submit').click();
      await expect(p2Page).toHaveURL('/', { timeout: 10000 });

      const p3Context = await browser.newContext(videoOptions);
      const p3Page = await p3Context.newPage();
      await p3Page.goto('/register');
      await p3Page.getByTestId('register-name').fill(player3.name);
      await p3Page.getByTestId('register-username').fill(player3.username);
      await p3Page.getByTestId('register-email').fill(player3.email);
      await p3Page.getByTestId('register-password').fill(player3.password);
      await p3Page.getByTestId('register-submit').click();
      await expect(p3Page).toHaveURL('/', { timeout: 10000 });
      
      await page.getByTestId('org-management-button').click();
      await page.getByRole('button', { name: /Invite Player|Convidar Jogador/i }).first().click();
      
      // Ensure link is generated
      if (await page.getByTestId('generate-public-link-button').isVisible()) {
        await page.getByTestId('generate-public-link-button').click();
      }
      
      const inviteLinkText = await page.getByTestId('public-invite-link-text').textContent();
      const cleanLink = inviteLinkText!.trim();

      await p2Page.goto(cleanLink);
      await p2Page.getByTestId('join-org-button').click();
      await expect(p2Page).toHaveURL(/\/organizations\/\d+/, { timeout: 10000 });

      await p3Page.goto(cleanLink);
      await p3Page.getByTestId('join-org-button').click();
      await expect(p3Page).toHaveURL(/\/organizations\/\d+/, { timeout: 10000 });

      await p2Context.close();
      await p3Context.close();

      await test.step('Create Pelada and Manage Attendance', async () => {
        await page.goto(`/organizations/${orgId}`);
        await page.getByTestId('create-pelada-submit').click();
        await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/);

        const peladaId = page.url().split('/').reverse()[1];

        await page.getByRole('button', { name: /I'm In|Eu vou/i }).click();
        await page.getByRole('button', { name: /Close List and Create Teams/i }).click();
        await expect(page).toHaveURL(new RegExp(`/peladas/${peladaId}$`));

        // Add player 2 and 3
        await page.getByRole('button', { name: /Adicionar jogadores|Add players/i }).click();
        
        // Wait for players to load in dialog
        await expect(page.getByRole('dialog').getByText(player2.name)).toBeVisible();
        await page.getByRole('dialog').getByText(player2.name).click();
        await page.getByRole('dialog').getByText(player3.name).click();
        
        await page.getByRole('button', { name: /Add Selected|Adicionar Selecionados/i }).click();

        await expect(page.getByText(player2.name)).toBeVisible();
        await expect(page.getByText(player3.name)).toBeVisible();
      });

      await test.step('Randomize Teams and Start', async () => {
        await page.getByTestId('randomize-teams-button').click();
        await page.waitForTimeout(1000);

        await page.getByTestId('start-pelada-button').click();
        await page.getByTestId('confirm-start-pelada-button').click();
        await expect(page).toHaveURL(/\/peladas\/\d+\/matches/);
      });

      await test.step('Increment goals and end match 1', async () => {
        // Wait for match data to load
        await expect(page.getByTestId('end-match-button')).toBeVisible();

        const ownerRow = page.getByTestId('player-row').filter({ hasText: owner.name });
        await expect(ownerRow).toBeVisible();
        
        await ownerRow.getByTestId('stat-goals-increment').click();
        await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('1');

        await page.getByTestId('end-match-button').click();
        
        // Verification: UI auto-selects next match (Match 2), so we should see end-match-button for Match 2
        await expect(page.getByTestId('end-match-button')).toBeVisible({ timeout: 15000 });
      });

      await test.step('Go back to match 1 to edit', async () => {
        const sidebarMatch1 = page.locator('button, [role="button"]').filter({ hasText: /Seq 1:/ }).first();
        await sidebarMatch1.click();
        await page.waitForTimeout(1000);
        
        await expect(page.getByTestId('match-status-text')).toBeVisible({ timeout: 15000 });
        await page.getByTestId('edit-match-button').click();
        
        const ownerRow = page.getByTestId('player-row').filter({ hasText: owner.name });
        await expect(ownerRow.getByTestId('stat-goals-increment')).toBeEnabled();
        
        // Change goals from 1 to 2
        await ownerRow.getByTestId('stat-goals-increment').click();
        await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('2');
        
        // Save
        await page.getByTestId('finish-editing-button').click();
        
        // Controls should be disabled again
        await expect(ownerRow.getByTestId('stat-goals-increment')).toBeDisabled();
        await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('2');
      });

      await test.step('Close pelada and verify edit button is still visible for admin', async () => {
        await page.getByTestId('close-pelada-button').click();
        await expect(page.getByText(/Pelada closed|Pelada encerrada/i)).toBeVisible();
        await expect(page.getByTestId('edit-match-button')).toBeVisible();
      });

    } finally {
      await ownerContext.close();
      await saveVideo(page, 'edit-match-flow', testInfo);
    }
  });
});
