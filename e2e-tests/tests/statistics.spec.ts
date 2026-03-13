import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

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

    await test.step('1. Setup Organization', async () => {
      await page.goto('/register');
      await page.getByTestId('register-name').fill(owner.name);
      await page.getByTestId('register-username').fill(owner.username);
      await page.getByTestId('register-email').fill(owner.email);
      await page.getByTestId('register-password').fill(owner.password);
      await page.getByLabel('Position').click();
      await page.getByRole('option', { name: owner.position }).click();
      await page.getByTestId('register-submit').click();
      await expect(page).toHaveURL('/', { timeout: 10000 });

      await page.getByTestId('create-org-open-dialog').click();
      await page.getByTestId('org-name-input').fill(orgName);
      await page.getByTestId('org-submit-button').click();
      
      await expect(page.getByTestId(`org-link-${orgName}`)).toBeVisible();
      await page.getByTestId(`org-link-${orgName}`).click();
    });

    await test.step('2. Access Statistics Page', async () => {
      await page.getByTestId('org-statistics-button').click();
      await expect(page).toHaveURL(/\/organizations\/\d+\/statistics/);
      
      // Check for title
      await expect(page.getByRole('heading', { name: new RegExp(orgName) })).toBeVisible();
      
      // Check for Top Cards (should be visible but empty-ish)
      await expect(page.getByRole('heading', { name: /Artilheiro|Top Scorer/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Garçom|Top Assister/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /MVP/i })).toBeVisible();
    });

    await test.step('3. Verify Filters', async () => {
      // Check search input
      const searchInput = page.getByPlaceholder(/Nome do Jogador|Player Name/i);
      await expect(searchInput).toBeVisible();
      await searchInput.fill('Non Existent Player');
      
      // Check empty state
      await expect(page.getByText(/Nenhuma estatística encontrada|No statistics found/i)).toBeVisible();
      
      // Clear search
      await searchInput.fill('');
      
      // Check collapsible filters
      await page.getByTestId('filters-header').click();
      await expect(searchInput).toBeHidden();
      
      await page.getByTestId('filters-header').click();
      await expect(searchInput).toBeVisible();
    });

    await test.step('4. Verify Export Button', async () => {
      const exportBtn = page.getByRole('button', { name: /EXPORTAR|EXPORT/i });
      await expect(exportBtn).toBeVisible();
    });

    await context.close();
    await saveVideo(page, 'organization-statistics', testInfo);
  });
});
