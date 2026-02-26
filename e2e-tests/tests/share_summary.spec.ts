import { test, expect } from '@playwright/test';

test.describe('Share Pelada Summary', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    email: `share-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Share Org ${timestamp}`;
  
  test('should show share summary button', async ({ page }) => {
    // 1. Register and setup Org
    await page.goto('/register');
    await page.getByTestId('register-name').fill(owner.name);
    await page.getByTestId('register-username').fill(`user_share_${timestamp}`);
    await page.getByTestId('register-email').fill(owner.email);
    await page.getByTestId('register-password').fill(owner.password);
    await page.getByLabel('Position').click();
    await page.getByRole('option', { name: 'Defender' }).click();
    await page.getByTestId('register-submit').click();
    
    await page.getByTestId('create-org-open-dialog').click();
    await page.getByTestId('org-name-input').fill(orgName);
    await page.getByTestId('org-submit-button').click();
    await page.getByTestId(`org-link-${orgName}`).click();

    // 2. Create Pelada
    await page.getByTestId('create-pelada-submit').click();
    await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/);
    await page.getByTestId('attendance-confirm-button').click();
    await page.getByTestId('close-attendance-button').click();

    // 3. Start Pelada
    await page.getByTestId('randomize-teams-button').click();
    await page.getByTestId('start-pelada-button').click();
    await page.getByTestId('confirm-start-pelada-button').click();

    // 4. Verify Matches Page and Share Button
    await expect(page).toHaveURL(/\/peladas\/\d+\/matches/);
    
    // Wait for the insights title to be sure data loaded
    await expect(page.getByText(/Insights/i)).toBeVisible();
    
    // Capture the button screenshot
    const shareButton = page.getByRole('button', { name: /Compartilhar Resumo|Share Summary/i });
    await expect(shareButton).toBeVisible();
    
    // Take a full page screenshot to see the context
    await page.screenshot({ path: 'share_summary_full_page.png' });
  });
});
