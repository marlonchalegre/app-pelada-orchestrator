import { test, expect } from '@playwright/test';
import {
  registerAndCreateOrg,
  makeMensalista,
} from './utils';

test.describe('Manual Fine Control', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Manual Owner ${timestamp}`,
    username: `manual_owner_${timestamp}`,
    email: `manual-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const orgName = `Manual Org ${timestamp}`;

  test('should allow admin to choose not to apply fine after deadline', async ({ page }) => {
    // 1. Setup
    await registerAndCreateOrg(page, owner, orgName);
    
    // 2. Configure Price and Fine
    await page.getByTestId('org-management-button').click();
    await page.getByTestId('mgmt-tab-finance').click();
    await page.getByTestId('finance-tab-config').click();
    
    await page.getByTestId('mensalista-price-input').fill('100');
    await page.getByTestId('monthly-fine-amount-input').fill('20');
    await page.getByTestId('monthly-cut-off-day-input').fill('1'); // Deadline was day 1
    
    await page.getByTestId('save-finance-config-button').click();
    await expect(page.getByTestId('finance-success')).toBeVisible();

    // 3. Make owner Mensalista
    await makeMensalista(page, owner.name);

    // 4. Go to Monthly Payments
    await page.getByTestId('mgmt-tab-finance').click();
    await page.getByTestId('finance-tab-monthly').click();

    // Since today is May 8, 2026 (or whatever), and cutoff was day 1, fine is applicable
    const playerRow = page.getByTestId(/monthly-payment-row-/).filter({ hasText: owner.name });
    await expect(playerRow.getByText('+ R$ 20,00 (multa)')).toBeVisible();

    // 5. Mark as paid but UNCHECK fine
    await playerRow.getByTestId('mark-payment-button').click();
    await expect(page.getByTestId('mark-payment-dialog')).toBeVisible();
    
    // Checkbox should be checked by default if after deadline
    await expect(page.getByTestId('apply-fine-checkbox').locator('input')).toBeChecked();
    
    // Uncheck it
    await page.getByTestId('apply-fine-checkbox').click();
    await expect(page.getByTestId('apply-fine-checkbox').locator('input')).not.toBeChecked();
    
    await page.getByTestId('confirm-mark-payment-button').click();
    await expect(page.getByTestId('finance-success')).toBeVisible();

    // 6. Verify UI shows paid WITHOUT fine message
    await expect(playerRow.getByTestId('status-paid')).toBeVisible();
    await expect(playerRow.getByText('R$ 100,00')).toBeVisible();
    await expect(playerRow.locator('text=+ R$ 20,00 (multa)')).not.toBeVisible();

    // 7. Verify Transaction
    await page.getByTestId('finance-tab-transactions').click();
    const txRow = page.locator('tr').filter({ hasText: 'Mensalidade' });
    // Should see base fee
    await expect(txRow.getByText('R$ 100,00')).toBeVisible();
    // Should NOT see fine transaction
    await expect(page.locator('tr').filter({ hasText: 'Multa Mensalidade' })).not.toBeVisible();
  });

  test('should still apply fine if admin leaves checkbox checked', async ({ page }) => {
    // 1. Setup (using existing org/user if possible, but new one for isolation)
    await registerAndCreateOrg(page, { ...owner, username: owner.username + '2', email: '2' + owner.email }, orgName + ' 2');
    
    await page.getByTestId('org-management-button').click();
    await page.getByTestId('mgmt-tab-finance').click();
    await page.getByTestId('finance-tab-config').click();
    await page.getByTestId('mensalista-price-input').fill('100');
    await page.getByTestId('monthly-fine-amount-input').fill('20');
    await page.getByTestId('monthly-cut-off-day-input').fill('1');
    await page.getByTestId('save-finance-config-button').click();

    await makeMensalista(page, owner.name);
    await page.getByTestId('mgmt-tab-finance').click();
    await page.getByTestId('finance-tab-monthly').click();

    const playerRow = page.getByTestId(/monthly-payment-row-/).filter({ hasText: owner.name });
    await playerRow.getByTestId('mark-payment-button').click();
    
    // Leave checked and confirm
    await page.getByTestId('confirm-mark-payment-button').click();
    await expect(page.getByTestId('finance-success')).toBeVisible();

    // Verify UI shows paid WITH fine message
    await expect(playerRow.getByTestId('status-paid')).toBeVisible();
    await expect(playerRow.getByText('R$ 120,00')).toBeVisible();
    await expect(playerRow.getByText('+ R$ 20,00 (multa)')).toBeVisible();

    // Verify Transactions (should see two lines)
    await page.getByTestId('finance-tab-transactions').click();
    await expect(page.locator('tr').filter({ hasText: 'Mensalidade' }).getByText('R$ 100,00')).toBeVisible();
    await expect(page.locator('tr').filter({ hasText: 'Multa Mensalidade' }).getByText('R$ 20,00')).toBeVisible();
  });

  test('should allow reversing the fine independently', async ({ page }) => {
    await registerAndCreateOrg(page, { ...owner, username: owner.username + '3', email: '3' + owner.email }, orgName + ' 3');
    await page.getByTestId('org-management-button').click();
    await page.getByTestId('mgmt-tab-finance').click();
    await page.getByTestId('finance-tab-config').click();
    await page.getByTestId('mensalista-price-input').fill('100');
    await page.getByTestId('monthly-fine-amount-input').fill('20');
    await page.getByTestId('monthly-cut-off-day-input').fill('1');
    await page.getByTestId('save-finance-config-button').click();

    await makeMensalista(page, owner.name);
    await page.getByTestId('mgmt-tab-finance').click();
    await page.getByTestId('finance-tab-monthly').click();

    const playerRow = page.getByTestId(/monthly-payment-row-/).filter({ hasText: owner.name });
    await playerRow.getByTestId('mark-payment-button').click();
    await page.getByTestId('confirm-mark-payment-button').click();
    await expect(playerRow.getByTestId('status-paid')).toBeVisible();

    // Verify both transactions
    await page.getByTestId('finance-tab-transactions').click();
    await expect(page.locator('tr').filter({ hasText: 'Mensalidade' }).getByText('R$ 100,00')).toBeVisible();
    const fineRow = page.locator('tr').filter({ hasText: 'Multa Mensalidade' });
    await expect(fineRow.getByText('R$ 20,00')).toBeVisible();

    // Reverse ONLY the fine
    await fineRow.locator('[data-testclass="reverse-transaction-button"]').click();
    await page.getByTestId('pretty-confirm-button').click();
    
    // Check for success message using test ID
    await expect(page.getByTestId('finance-success')).toBeVisible();
    await expect(page.getByTestId('finance-success')).toContainText(/(sucesso|successfully)/i);

    // Fine should be line-through in transactions
    await expect(fineRow.getByTestId('transaction-amount')).toHaveCSS('text-decoration-line', 'line-through');

    // Monthly payment should STILL be paid, but WITHOUT fine message
    await page.getByTestId('finance-tab-monthly').click();
    await expect(playerRow.getByTestId('status-paid')).toBeVisible();
    await expect(playerRow.getByText('R$ 100,00')).toBeVisible();
    await expect(playerRow.locator('text=+ R$ 20,00 (multa)')).not.toBeVisible();
  });
});
