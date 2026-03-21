import { test, expect } from '@playwright/test';
import { saveVideo, registerAndCreateOrg } from './utils';

test.describe('Manual Statistics Import', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `owner_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const orgName = `Stats Org ${timestamp}`;

  test('should import manual statistics successfully', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await test.step('Setup', async () => {
      await registerAndCreateOrg(page, owner, orgName);
    });

    await test.step('Navigate to Statistics and Open Import Dialog', async () => {
      await page.reload();
      const responsePromise = page.waitForResponse(response => response.url().includes('/players') && response.status() === 200);
      await page.locator(`a[href*="/statistics"]`).first().click();
      await responsePromise;

      await expect(page.getByTestId('import-stats-button')).toBeVisible({ timeout: 15000 });
      await page.getByTestId('import-stats-button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
    });

    await test.step('Add Manual Entry', async () => {
      await page.getByTestId('add-manual-row-button').click();
      await expect(page.getByTestId('import-row-0')).toBeVisible();

      await page.getByTestId('player-autocomplete-input-0').fill(owner.name);
      await page.getByRole('option', { name: owner.name }).click();

      await page.getByTestId('goals-input-0').fill('5');
      await page.getByTestId('assists-input-0').fill('3');
      await page.getByTestId('own-goals-input-0').fill('1');
      await page.getByTestId('import-confirm-button').click();
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10000 });
    });

    await test.step('Verify Statistics in Table', async () => {
      const row = page.locator('tr', { hasText: owner.name });
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row.getByText('5').first()).toBeVisible();
      await expect(row.getByText('3').first()).toBeVisible();
      await expect(row.getByText('1').first()).toBeVisible();
    });

    await context.close();
    await saveVideo(page, 'manual-stats', testInfo);
  });
});
