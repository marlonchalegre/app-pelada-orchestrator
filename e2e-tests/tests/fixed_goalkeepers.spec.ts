import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('Feature: Global Fixed Goalkeepers', () => {
  const timestamp = Date.now();
  const user = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: 'password123',
  };
  const orgName = `GK Club ${timestamp}`;

  test('should allow setting global fixed goalkeepers and verify dashboard', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    try {
      await test.step('Setup: Register and Create Organization', async () => {
        await page.goto('/register');
        await page.getByTestId('register-name').fill(user.name);
        await page.getByTestId('register-username').fill(user.username);
        await page.getByTestId('register-email').fill(user.email);
        await page.getByTestId('register-password').fill(user.password);
        await page.getByTestId('register-submit').click();
        await expect(page).toHaveURL('/');

        await page.getByTestId('create-org-open-dialog').click();
        await page.getByTestId('org-name-input').fill(orgName);
        await page.getByTestId('org-submit-button').click();
        
        const orgLink = page.getByTestId(`org-link-${orgName}`);
        await expect(orgLink).toBeVisible();
        await orgLink.click();
      });

      await test.step('Create Pelada with Fixed Goalkeepers', async () => {
        await page.getByTestId('create-pelada-submit').scrollIntoViewIfNeeded();
        await page.getByLabel(/Fixed Goalkeepers/i).check();
        await page.getByTestId('create-pelada-submit').click();
        
        await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/);
      });

      await test.step('Manage Attendance', async () => {
        await page.getByRole('button', { name: /I'm In/i }).click();
        await page.getByRole('button', { name: /Close List and Create Teams/i }).click();
        await expect(page).toHaveURL(/\/peladas\/\d+$/);
      });

      await test.step('Verify Global GK Section', async () => {
        await expect(page.getByText(/Session Fixed Goalkeepers/i)).toBeVisible();
        await expect(page.getByText(/GOALKEEPER \(HOME\)/i)).toBeVisible();
        await expect(page.getByText(/GOALKEEPER \(AWAY\)/i)).toBeVisible();
      });

      await test.step('Randomize and Start Match', async () => {
        // Create teams
        await page.getByTestId('create-team-button').click();
        await page.getByTestId('create-team-button').click();
        
        await page.getByTestId('randomize-teams-button').click();
        await page.waitForTimeout(1000);

        const startBtn = page.getByTestId('start-pelada-button');
        await startBtn.scrollIntoViewIfNeeded();
        await startBtn.click();
        await page.getByTestId('confirm-start-pelada-button').click();
        
        await expect(page).toHaveURL(/\/peladas\/\d+\/matches/);
      });

      await test.step('Verify Match Dashboard GK Identification', async () => {
        const playerRow = page.getByTestId('player-row').first();
        await expect(playerRow).toBeVisible();
        const playerName = await playerRow.getByTestId('player-name').textContent();
        expect(playerName).not.toContain('0');
      });

    } finally {
      await context.close();
      await saveVideo(page, 'fixed-goalkeepers-final', testInfo);
    }
  });
});
