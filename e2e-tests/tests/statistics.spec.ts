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
      await expect(page).toHaveURL(/\/organizations\/\d+\/statistics/);
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
});
