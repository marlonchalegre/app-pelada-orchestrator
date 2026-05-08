import { test, expect } from '@playwright/test';
import {
  registerAndCreateOrg,
  makeMensalista,
} from './utils';

test.describe('Automatic Fine', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Fine Owner ${timestamp}`,
    username: `fine_owner_${timestamp}`,
    email: `fine-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const orgName = `Fine Org ${timestamp}`;

  test('should apply fine automatically after day 5', async ({ page }) => {
    // 1. Setup
    await registerAndCreateOrg(page, owner, orgName);
    
    // 2. Configure Price and custom Fine
    await page.getByTestId('org-management-button').click();
    await expect(page.getByTestId('org-mgmt-container')).toBeVisible();
    await page.getByTestId('mgmt-tab-finance').click();
    await page.getByTestId('finance-tab-config').click();
    
    await page.getByTestId('mensalista-price-input').fill('100');
    await page.getByTestId('monthly-fine-amount-input').fill('15');
    await page.getByTestId('monthly-cut-off-day-input').fill('5');
    
    await page.getByTestId('save-finance-config-button').click();
    await expect(page.getByTestId('finance-success')).toBeVisible();

    // 3. Make owner Mensalista
    await makeMensalista(page, owner.name);

    // 4. Check Monthly Payments Tab
    await page.getByTestId('mgmt-tab-finance').click();
    await page.getByTestId('finance-tab-monthly').click();

    // Since today is May 6, 2026:
    // With cut-off day 5, May 2026 should show custom fine (+ R$ 15,00)
    await page.getByTestId('month-select').click();
    await page.getByTestId('month-option-5').click(); // May
    
    const playerRow = page.getByTestId(/monthly-payment-row-/).filter({ hasText: owner.name });
    await expect(playerRow.getByText('R$ 115,00')).toBeVisible();
    await expect(playerRow.getByText('+ R$ 15,00 (multa)')).toBeVisible();

    // Now change cut-off day to 10
    await page.getByTestId('finance-tab-config').click();
    await page.getByTestId('monthly-cut-off-day-input').fill('10');
    await page.getByTestId('save-finance-config-button').click();
    await expect(page.getByTestId('finance-success')).toBeVisible();

    // Check Monthly Payments again - fine should be GONE (since May 6 <= May 10)
    await page.getByTestId('finance-tab-monthly').click();
    await expect(playerRow.getByText('R$ 100,00')).toBeVisible();
    await expect(playerRow.locator('text=+ R$ 15,00 (multa)')).not.toBeVisible();

    // 5. Mark May as paid and verify transaction (restore fine to 15 first for the check)
    await page.getByTestId('finance-tab-config').click();
    await page.getByTestId('monthly-cut-off-day-input').fill('5');
    await page.getByTestId('save-finance-config-button').click();
    
    await page.getByTestId('finance-tab-monthly').click();
    await playerRow.getByTestId('mark-payment-button').click();
    await page.getByTestId('confirm-mark-payment-button').click();
    await expect(playerRow.getByTestId('status-paid')).toBeVisible();

    // 6. Verify Transaction breakdown
    await page.getByTestId('finance-tab-transactions').click();
    await expect(page.getByText('Mensalidade 5/2026', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Multa Mensalidade 5/2026', { exact: true })).toBeVisible();
    
    const txRow = page.locator('tr').filter({ hasText: 'Mensalidade 5/2026' }).filter({ hasNotText: 'Multa' });
    await expect(txRow.getByText('R$ 100,00')).toBeVisible();

    const fineRow = page.locator('tr').filter({ hasText: 'Multa Mensalidade 5/2026' });
    await expect(fineRow.getByText('R$ 15,00')).toBeVisible();
  });
});
