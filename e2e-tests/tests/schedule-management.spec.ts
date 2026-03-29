import { test, expect } from '@playwright/test';
import { saveVideo, registerAndCreateOrg, createPelada, closeAttendance, setupTeams, startPelada } from './utils';

test.describe('Schedule Management', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Schedule Org ${timestamp}`;

  test('should build, customize and use a manual schedule', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());

    await test.step('Setup Org and Pelada', async () => {
      await registerAndCreateOrg(ownerPage, owner, orgName);
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await createPelada(ownerPage);
      await closeAttendance(ownerPage);
    });

    await test.step('Customize Schedule', async () => {
      await setupTeams(ownerPage, { count: 2 });

      await ownerPage.getByTestId('build-schedule-button').click();
      await expect(ownerPage).toHaveURL(/\/build-schedule/);

      // Change matches per team
      await ownerPage.getByTestId('matches-per-team-select').click();
      await ownerPage.getByRole('option', { name: /^3/ }).click();
      await expect(ownerPage.getByRole('row')).toHaveCount(4); // Header + 3

      // Add manual match
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

    await test.step('Start with Built Schedule', async () => {
      await startPelada(ownerPage);

      await ownerPage.getByTestId('toggle-history-drawer').click();
      const drawer = ownerPage.getByTestId('history-drawer');
      await expect(drawer.getByTestId('match-history-item-1')).toBeVisible({ timeout: 10000 });
      await expect(drawer.getByTestId('match-history-item-4')).toBeVisible();
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'schedule-management', testInfo);
  });
});
