import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('Schedule Management', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Schedule Org ${timestamp}`;

  test('should build, customize and use a manual schedule', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());

    // 1. Setup
    await test.step('Setup Org and Pelada', async () => {
      await ownerPage.goto('/register');
      await ownerPage.getByTestId('register-name').fill(owner.name);
      await ownerPage.getByTestId('register-username').fill(owner.username);
      await ownerPage.getByTestId('register-email').fill(owner.email);
      await ownerPage.getByTestId('register-password').fill(owner.password);
      await ownerPage.getByTestId('register-submit').click();

      await ownerPage.getByTestId('create-org-open-dialog').click();
      await ownerPage.getByTestId('org-name-input').fill(orgName);
      await ownerPage.getByTestId('org-submit-button').click();
      await ownerPage.getByTestId(`org-link-${orgName}`).click();

      // Create Pelada
      await ownerPage.getByTestId('create-pelada-submit').click();
      await ownerPage.getByTestId('close-attendance-button').click();
      await ownerPage.getByTestId('confirm-close-attendance-button').click();
    });

    // 2. Build Schedule
    await test.step('Customize Schedule', async () => {
      // Create at least 2 teams first
      await ownerPage.getByTestId('create-team-button').click();
      await ownerPage.getByTestId('create-team-button').click();

      await ownerPage.getByTestId('build-schedule-button').click();
      await expect(ownerPage).toHaveURL(/\/build-schedule/);

      // Change matches per team
      await ownerPage.getByTestId('matches-per-team-select').click();
      await ownerPage.getByRole('option', { name: '3' }).click();

      // Should automatically fetch/update
      await expect(ownerPage.getByRole('row')).toHaveCount(4); // Header + 3 matches (for 2 teams, 3 per team = 3 matches total)

      // Add a manual match
      await ownerPage.getByTestId('add-match-button').click();
      await expect(ownerPage.getByRole('row')).toHaveCount(5);

      // Invert home/away of first match
      const homeSelect = ownerPage.getByTestId('home-select-0');
      const awaySelect = ownerPage.getByTestId('away-select-0');
      
      const homeText = await homeSelect.textContent();
      const awayText = await awaySelect.textContent();
      
      await ownerPage.getByTestId('swap-button-0').click();
      
      await expect(homeSelect).toHaveText(awayText!);
      await expect(awaySelect).toHaveText(homeText!);

      // Save
      await ownerPage.getByTestId('save-schedule-button').click();
      await expect(ownerPage).toHaveURL(/\/peladas\/\d+$/);
    });

    // 3. Start Pelada
    await test.step('Start with Built Schedule', async () => {
      const startButton = ownerPage.getByTestId('start-pelada-button');
      await expect(startButton).toBeEnabled();
      await startButton.click();

      // Since we auto-accept dialogs in this test setup (ownerPage.on('dialog', ...)), 
      // the confirm() will be handled immediately.
      
      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/matches/);
      await expect(ownerPage.getByTestId('match-history-item-1')).toBeVisible();
      await expect(ownerPage.getByTestId('match-history-item-4')).toBeVisible();
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'schedule-management', testInfo);
  });
});
