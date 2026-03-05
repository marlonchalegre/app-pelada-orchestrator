import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('New Features: Export, Settings & Add Players', () => {
  const timestamp = Date.now();
  const admin = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: 'password123',
  };
  const player2 = {
    name: `Player ${timestamp}`,
    username: `player_${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123',
  };
  const orgName = `Features Org ${timestamp}`;

  test('should verify all new features in a single flow', async ({ browser }, testInfo) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // 1. Setup Admin and Organization
      await test.step('Register and Create Org', async () => {
        await page.goto('/register');
        await page.getByTestId('register-name').fill(admin.name);
        await page.getByTestId('register-username').fill(admin.username);
        await page.getByTestId('register-email').fill(admin.email);
        await page.getByTestId('register-password').fill(admin.password);
        await page.getByTestId('register-submit').click();
        await expect(page).toHaveURL('/');

        await page.getByTestId('create-org-open-dialog').click();
        await page.getByTestId('org-name-input').fill(orgName);
        await page.getByTestId('org-submit-button').click();
        await page.getByTestId(`org-link-${orgName}`).click();
      });

      const orgId = page.url().split('/').pop();
      let peladaId = '';

      // 2. Register Player 2 (using a second context to avoid logout)
      await test.step('Register Player 2', async () => {
        const p2Context = await browser.newContext();
        const p2Page = await p2Context.newPage();
        await p2Page.goto('/register');
        await p2Page.getByTestId('register-name').fill(player2.name);
        await p2Page.getByTestId('register-username').fill(player2.username);
        await p2Page.getByTestId('register-email').fill(player2.email);
        await p2Page.getByTestId('register-password').fill(player2.password);
        await p2Page.getByTestId('register-submit').click();
        
        // Wait for registration to complete and redirect to home
        await expect(p2Page).toHaveURL('/', { timeout: 10000 });
        await expect(p2Page.getByTestId('user-settings-button')).toBeVisible({ timeout: 10000 });
        
        // Invite and Join
        await page.getByTestId('org-management-button').click();
        await page.getByRole('button', { name: /Invite Player|Convidar Jogador/i }).first().click();
        
        // Ensure link is generated
        if (await page.getByTestId('generate-public-link-button').isVisible()) {
          await page.getByTestId('generate-public-link-button').click();
        }
        
        const inviteLink = await page.getByTestId('public-invite-link-text').textContent();
        expect(inviteLink).toContain('/join/');
        
        await p2Page.goto(inviteLink!.trim());
        await expect(p2Page.getByTestId('join-org-button')).toBeVisible({ timeout: 15000 });
        await p2Page.getByTestId('join-org-button').click();
        await p2Context.close();

      });

      // 3. Create Pelada and test "Add Players"
      await test.step('Verify Add Players Feature', async () => {
        await page.goto(`/organizations/${orgId}`);
        await page.getByTestId('create-pelada-submit').click();
        await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/);
        peladaId = page.url().split('/').filter(p => p !== '').slice(-2, -1)[0];
        
        // Admin confirms
        await page.getByRole('button', { name: /I'm In|Eu vou/i }).click();
        
        // Skip attendance and go to pelada dashboard
        await page.getByRole('button', { name: /Close List and Create Teams/i }).click();
        
        // Add player 2 using the new feature
        await page.getByRole('button', { name: /Adicionar jogadores|Add players/i }).click();
        
        // Wait for player to load in dialog
        await expect(page.getByRole('dialog').getByText(player2.name)).toBeVisible();
        await page.getByRole('dialog').getByText(player2.name).click();
        
        await page.getByRole('button', { name: /Add Selected|Adicionar Selecionados/i }).click();

        
        await expect(page.getByTestId('player-row').filter({ hasText: player2.name })).toBeVisible();
      });

      // 4. Test Settings (Fixed Goalkeepers Toggle)
      await test.step('Verify Settings Toggle', async () => {
        await expect(page.getByTestId('pelada-settings-button')).toBeVisible({ timeout: 10000 });
        await page.getByTestId('pelada-settings-button').click();
        await page.waitForTimeout(500); // Wait for menu to open
        await page.getByTestId('fixed-gk-switch-label').click();
        
        // Verify GK areas appear
        await expect(page.getByTestId('gk-slot-home')).toBeVisible({ timeout: 10000 });
        
        // Toggle off (menu might still be open or we might need to reopen it)
        // Let's try to click the switch again directly if it's still visible, 
        // or reopen if it closed.
        if (!await page.getByTestId('fixed-gk-switch-label').isVisible()) {
          await page.getByTestId('pelada-settings-button').click();
          await page.waitForTimeout(500);
        }
        await page.getByTestId('fixed-gk-switch-label').click();
        await expect(page.getByTestId('gk-slot-home')).not.toBeVisible({ timeout: 10000 });
        
        // Final cleanup: close menu if still open
        await page.keyboard.press('Escape');
        await expect(page.locator('role=presentation')).not.toBeVisible();
      });

      // NEW STEP: Randomize and Start to enable Export (some export data might depend on match state)
      await test.step('Randomize and Start', async () => {
        // Teams should be created automatically (default 2), wait for them
        await expect(page.locator('[data-testid="team-card"]')).toHaveCount(2, { timeout: 10000 });
        
        await page.getByTestId('randomize-teams-button').click();
        
        // Wait for randomization results: both players should be in teams
        await expect(page.getByTestId('player-row')).toHaveCount(2, { timeout: 10000 });
        
        await page.getByTestId('start-pelada-button').click();
        await page.getByTestId('confirm-start-pelada-button').click();
        await expect(page).toHaveURL(/\/peladas\/\d+\/matches/);
      });

      // 5. Test Export Menu
      await test.step('Verify Export Menu Options', async () => {
        // Export button is on the dashboard page, not matches page
        await page.goto(`/peladas/${peladaId}`);
        await expect(page).toHaveURL(new RegExp(`/peladas/${peladaId}$`));
        
        await page.getByRole('button', { name: /Export/i }).click();

        
        await expect(page.getByText(/Announcement Version|Versão de Divulgação/i)).toBeVisible();
        await expect(page.getByText(/Copy to Clipboard|Copiar para área de transferência/i)).toBeVisible();
        await expect(page.getByText(/Spreadsheet|Planilha/i)).toBeVisible();
        
        // Click Copy to Clipboard and verify alert (mock alert if necessary or just check it doesn't crash)
        // Playwright handles dialogs automatically or we can listen
        page.on('dialog', dialog => dialog.accept());
        await page.getByText(/Copy to Clipboard|Copiar para área de transferência/i).click();
      });

    } finally {
      await context.close();
      await saveVideo(page, 'new-features-verification', testInfo);
    }
  });
});
