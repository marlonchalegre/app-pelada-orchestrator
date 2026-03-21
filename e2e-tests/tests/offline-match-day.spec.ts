import { test, expect } from '@playwright/test';
import { saveVideo, setupMatchDay } from './utils';

test.describe('Offline Match Day', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Midfielder'
  };
  const player2 = {
    name: `Player ${timestamp}`,
    username: `p2_${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker'
  };
  const orgName = `Offline Org ${timestamp}`;

  test('should queue actions when offline, load from cache and sync when online', async ({ browser }, testInfo) => {
    test.setTimeout(240000);
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};

    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await setupMatchDay(page, browser, owner, orgName, player2);

    // Wait for data to settle and be cached
    await expect(page.getByTestId('player-row').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);

    // Go Offline
    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();

    // Start match timer
    await page.getByTestId('start-match-timer-button').click();
    await expect(page.getByTestId('pending-actions-count')).toContainText('2');

    // Add goal
    await page.getByTestId('stat-goals-increment').first().click();
    await expect(page.getByTestId('pending-actions-count')).toContainText('4');
    const scoreBoard = page.getByTestId('match-score-display');
    await expect(scoreBoard).toContainText('1');

    // Verify UI stays active
    await expect(page.getByRole('tab', { name: /Dashboard|Match/i })).toBeVisible();
    await expect(scoreBoard).toContainText('1');

    // Go Online
    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).not.toBeVisible();
    await expect(page.getByTestId('pending-actions-alert')).not.toBeVisible({ timeout: 20000 });
    await expect(scoreBoard).toContainText('1');

    // Verify persistence after reload
    await page.reload();
    await expect(page.getByTestId('match-score-display')).toContainText('1');

    await saveVideo(page, 'offline-match-day-sync', testInfo);
    await context.close();
  });
});
