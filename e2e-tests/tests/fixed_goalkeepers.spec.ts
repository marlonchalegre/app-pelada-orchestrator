import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('Feature: Global Fixed Goalkeepers', () => {
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
  const orgName = `GK Club ${timestamp}`;

  test('should allow setting global fixed goalkeepers and verify dashboard', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    
    // Create Admin context
    const adminContext = await browser.newContext(videoOptions);
    const adminPage = await adminContext.newPage();

    try {
      await test.step('Setup: Register Admin and Create Organization', async () => {
        await adminPage.goto('/register');
        await adminPage.getByTestId('register-name').fill(admin.name);
        await adminPage.getByTestId('register-username').fill(admin.username);
        await adminPage.getByTestId('register-email').fill(admin.email);
        await adminPage.getByTestId('register-password').fill(admin.password);
        await adminPage.getByTestId('register-submit').click();
        await expect(adminPage).toHaveURL('/');

        await adminPage.getByTestId('create-org-open-dialog').click();
        await adminPage.getByTestId('org-name-input').fill(orgName);
        await adminPage.getByTestId('org-submit-button').click();
        
        const orgLink = adminPage.getByTestId(`org-link-${orgName}`);
        await expect(orgLink).toBeVisible();
        await orgLink.click();
        await expect(adminPage).toHaveURL(/\/organizations\/\d+/);
      });

      const orgId = adminPage.url().split('/').pop();

      // Register second player and join

      const playerContext = await browser.newContext(videoOptions);
      const playerPage = await playerContext.newPage();
      
      await test.step('Register Player 2 and Join Org', async () => {
        await playerPage.goto('/register');
        await playerPage.getByTestId('register-name').fill(player2.name);
        await playerPage.getByTestId('register-username').fill(player2.username);
        await playerPage.getByTestId('register-email').fill(player2.email);
        await playerPage.getByTestId('register-password').fill(player2.password);
        await playerPage.getByTestId('register-submit').click();
        await expect(playerPage).toHaveURL('/');

        // Get invite link from Admin page (Management)
        await adminPage.getByTestId('org-management-button').click();
        await adminPage.getByRole('button', { name: /Invite Player|Convidar Jogador/i }).first().click();
        
        // Ensure link is generated
        if (await adminPage.getByTestId('generate-public-link-button').isVisible()) {
          await adminPage.getByTestId('generate-public-link-button').click();
        }
        
        const inviteLink = await adminPage.getByTestId('public-invite-link-text').textContent();
        expect(inviteLink).toContain('/join/');
        
        await playerPage.goto(inviteLink!);

        await playerPage.getByTestId('join-org-button').click();
        await expect(playerPage).toHaveURL(/\/organizations\/\d+/);
        
        // Verify in admin page
        await adminPage.reload();
        await expect(adminPage.getByText(player2.name)).toBeVisible({ timeout: 10000 });

        await playerContext.close();
      });

      // Extra wait for data sync
      await adminPage.waitForTimeout(5000);
      await adminPage.reload();
      await adminPage.waitForTimeout(2000);

      await test.step('Create Pelada', async () => {
        await adminPage.goto(`/organizations/${orgId}`);
        await adminPage.getByTestId('create-pelada-submit').scrollIntoViewIfNeeded();

        await adminPage.getByTestId('create-pelada-submit').click();
        
        await expect(adminPage).toHaveURL(/\/peladas\/\d+\/attendance/);
      });

      await test.step('Manage Attendance', async () => {
        // Players should be in pending list
        const confirmBtn = adminPage.getByTestId('attendance-confirm-button').or(adminPage.getByTestId('attendance-card-confirm')).first();
        await expect(confirmBtn).toBeVisible({ timeout: 15000 });
        await confirmBtn.click();
        
        // Player 2 should be in the list as pending. Confirm them.
        const p2Confirm = adminPage.getByTestId(`attendance-card-${player2.username}`).getByTestId('attendance-card-confirm');
        await expect(p2Confirm).toBeVisible({ timeout: 10000 });
        await p2Confirm.click();

        await adminPage.getByTestId('close-attendance-button').click();
        await expect(adminPage).toHaveURL(/\/peladas\/\d+$/);

        // Wait for player to be added
        await expect(adminPage.getByText(player2.name)).toBeVisible();
      });

      await test.step('Randomize and Start Match', async () => {
        // Ensure we are on pelada page and it is loaded
        await expect(adminPage.getByRole('button', { name: /Add players|Adicionar jogadores/i })).toBeVisible({ timeout: 15000 });

        // NEW: Enable Fixed Goalkeepers on Teams page (now in header)
        await adminPage.getByTestId('fixed-gk-toggle').click();

        // Create teams manually
        await adminPage.getByTestId('create-team-button').click();
        await adminPage.getByTestId('create-team-button').click();

        // Set technical settings manually
        const input = adminPage.getByTestId('players-per-team-input').locator('input');
        await input.click();
        await input.fill('5');
        await adminPage.waitForTimeout(500);

        // Teams should be visible (seeded by default)
        await expect(adminPage.locator('[data-testid="team-card"]')).toHaveCount(2, { timeout: 10000 });
        
        await adminPage.getByTestId('randomize-teams-button').click();
        
        // Wait for randomization results: both players should be in teams
        await expect(adminPage.getByTestId('player-row')).toHaveCount(2, { timeout: 10000 });

        // Assign fixed goalkeepers (since feature is enabled)

        // Give it a moment for UI to stabilize after randomization
        await adminPage.waitForTimeout(1000);

        // Find players already in teams to drag
        const teams = adminPage.getByTestId('team-card');
        const team1 = teams.nth(0);
        const team2 = teams.nth(1);
        
        await team1.getByTestId('player-row').first().dragTo(adminPage.getByTestId('gk-slot-home'));
        await team2.getByTestId('player-row').first().dragTo(adminPage.getByTestId('gk-slot-away'));



        const startBtn = adminPage.getByTestId('start-pelada-button');


        await startBtn.scrollIntoViewIfNeeded();
        await startBtn.click();
        await adminPage.getByTestId('confirm-start-pelada-button').click();
        
        await expect(adminPage).toHaveURL(/\/peladas\/\d+\/matches/);
      });

      await test.step('Verify Match Dashboard Player Identification', async () => {
        const playerRow = adminPage.getByTestId('player-row').first();
        await expect(playerRow).toBeVisible();
        const playerName = await playerRow.getByTestId('player-name').textContent();
        expect(playerName?.length).toBeGreaterThan(0);
      });


    } finally {
      await adminContext.close();
      await saveVideo(adminPage, 'fixed-goalkeepers-final', testInfo);
    }
  });
});
