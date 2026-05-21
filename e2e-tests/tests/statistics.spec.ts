import { test, expect } from '@playwright/test';
import { saveVideo, registerAndCreateOrg } from './utils';

test.describe('Organization Statistics', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Stats Owner ${timestamp}`,
    username: `stats_owner_${timestamp}`,
    email: `stats-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const orgName = `Stats Org ${timestamp}`;

  test('should display statistics and filters correctly', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());

    await test.step('Setup', async () => {
      await registerAndCreateOrg(page, owner, orgName);
    });

    await test.step('Access Statistics Page', async () => {
      await page.getByTestId('org-statistics-button').click();
      await expect(page).toHaveURL(/\/organizations\/[^\/]+\/statistics/);
      await expect(page.getByRole('heading', { name: new RegExp(orgName) })).toBeVisible();

      await expect(page.getByRole('heading', { name: /Artilheiro|Top Scorer/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Garçom|Top Assister/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /MVP/i })).toBeVisible();
    });

    await test.step('Verify Filters', async () => {
      const searchInput = page.getByPlaceholder(/Nome do Jogador|Player Name/i);
      await expect(searchInput).toBeVisible();
      await searchInput.fill('Non Existent Player');
      await expect(page.getByText(/Nenhuma estatística encontrada|No statistics found/i)).toBeVisible();
      await searchInput.fill('');

      await page.getByTestId('filters-header').click();
      await expect(searchInput).toBeHidden();
      await page.getByTestId('filters-header').click();
      await expect(searchInput).toBeVisible();
    });

    await test.step('Verify Export Button', async () => {
      await expect(page.getByRole('button', { name: /EXPORTAR|EXPORT/i })).toBeVisible();
    });

    await context.close();
    await saveVideo(page, 'organization-statistics', testInfo);
  });

  test('should import manual statistics successfully', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await test.step('Setup', async () => {
      const ts = timestamp + 1000;
      const importOwner = { ...owner, username: owner.username + 'i', email: 'i' + owner.email };
      const importOrgName = `${orgName} Import`;
      await registerAndCreateOrg(page, importOwner, importOrgName);
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
