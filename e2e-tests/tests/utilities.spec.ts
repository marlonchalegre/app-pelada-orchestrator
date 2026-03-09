import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

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

    await test.step('1. Registration & Org Creation', async () => {
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
      await expect(page).toHaveURL(/\/organizations\/\d+/);
    });

    await test.step('2. Navigate to Statistics and Open Import Dialog', async () => {
      // Reload to ensure AuthContext picks up the new organization admin role
      await page.reload();
      
      // Wait for the Statistics button and click it
      const responsePromise = page.waitForResponse(response => response.url().includes('/players') && response.status() === 200);
      await page.locator(`a[href*="/statistics"]`).first().click();
      await responsePromise;
      
      // Wait for page to load
      await expect(page.getByTestId('import-stats-button')).toBeVisible({ timeout: 15000 });
      await page.getByTestId('import-stats-button').click();

      // Ensure the dialog opens
      await expect(page.getByRole('dialog')).toBeVisible();
    });

    await test.step('3. Add Manual Entry', async () => {
      await page.getByTestId('add-manual-row-button').click();
      
      // The row should be visible
      await expect(page.getByTestId('import-row-0')).toBeVisible();

      // Select the owner as the player
      const playerInput = page.getByTestId('player-autocomplete-input-0');
      await playerInput.fill(owner.name);
      
      // Select the option from autocomplete dropdown
      await page.getByRole('option', { name: owner.name }).click();

      // Fill stats
      await page.getByTestId('goals-input-0').fill('5');
      await page.getByTestId('assists-input-0').fill('3');
      await page.getByTestId('own-goals-input-0').fill('1');

      await page.getByTestId('import-confirm-button').click();

      // Wait for dialog to close
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10000 });
    });

    await test.step('4. Verify Statistics in Table', async () => {
      // The table should now show 5 goals, 3 assists, 1 own goal for the owner
      // Wait for the stats table to re-fetch and render
      const row = page.locator('tr', { hasText: owner.name });
      await expect(row).toBeVisible({ timeout: 10000 });

      // Check values
      await expect(row.getByText('5').first()).toBeVisible(); // Goals is the first numerical column usually
      await expect(row.getByText('3').first()).toBeVisible(); // Assists
      await expect(row.getByText('1').first()).toBeVisible(); // Own goals
    });

    await context.close();
    await saveVideo(page, 'manual-stats', testInfo);
  });
});
