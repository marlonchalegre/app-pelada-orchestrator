import { test, expect, Page } from '@playwright/test';
import {
  registerAndCreateOrg,
  createPelada,
  makeMensalista,
} from './utils';

async function navigateToOrgManagement(page: Page, orgName: string) {
  await page.goto('/');
  await page.getByTestId(`org-link-${orgName}`).click();
  await expect(page.getByTestId('org-management-button')).toBeVisible();
  await page.getByTestId('org-management-button').click();
  
  // Wait for loading or container
  await expect(page.getByTestId('org-mgmt-loading').or(page.getByTestId('org-mgmt-container'))).toBeVisible();
  
  // If it's loading, wait for it to finish
  if (await page.getByTestId('org-mgmt-loading').isVisible()) {
    await expect(page.getByTestId('org-mgmt-container')).toBeVisible({ timeout: 30000 });
  }
}

async function makeDiarista(page: Page, orgName: string, playerName: string) {
  await navigateToOrgManagement(page, orgName);
  await page.getByTestId('mgmt-tab-members').click();
  const memberRow = page.locator('li').filter({ hasText: playerName });
  await memberRow.getByRole('combobox').click();
  await page.getByRole('option', { name: /Diarista/i }).click();
  // Wait for persistence
  await page.waitForTimeout(1000);
}

test.describe('Financial Control', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner Finance ${timestamp}`,
    username: `fin_owner_${timestamp}_${Math.floor(Math.random() * 10000)}`,
    email: `fin-owner-${timestamp}-${Math.floor(Math.random() * 10000)}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const orgName = `Finance Org ${timestamp}`;

  test('should manage organization finances, transactions and payments', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const page = await ownerContext.newPage();

    await test.step('1. Setup Org and Configure Prices', async () => {
      await registerAndCreateOrg(page, owner, orgName);
      
      await expect(page.getByTestId('org-management-button')).toBeVisible();
      await page.getByTestId('org-management-button').click();
      
      await expect(page.getByTestId('org-mgmt-loading').or(page.getByTestId('org-mgmt-container'))).toBeVisible();
      if (await page.getByTestId('org-mgmt-loading').isVisible()) {
        await expect(page.getByTestId('org-mgmt-container')).toBeVisible({ timeout: 30000 });
      }
      
      await page.getByTestId('mgmt-tab-finance').click();
      
      // Go to Config tab
      await page.getByTestId('finance-tab-config').click();
      
      const mensalistaInput = page.getByTestId('mensalista-price-input');
      const diaristaInput = page.getByTestId('diarista-price-input');
      
      await mensalistaInput.fill('100');
      await diaristaInput.fill('25');
      
      await page.getByTestId('save-finance-config-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();
    });

    await test.step('2. Manual Transactions', async () => {
      await page.getByTestId('finance-tab-transactions').click();
      
      // Add Expense
      await page.getByTestId('add-transaction-button').click();
      await page.getByTestId('tx-type-select').click();
      await page.getByTestId('tx-type-expense').click();
      await page.getByTestId('tx-amount-input').fill('50');
      await page.getByTestId('tx-category-select').click();
      await page.getByTestId('tx-category-option-field_rent').click();
      await page.getByTestId('tx-description-input').fill('Aluguel quadra');
      await page.getByTestId('confirm-add-transaction-button').click();
      
      // Verify Summary updated using data-amount
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '-50');
      
      // Add Income
      await page.getByTestId('add-transaction-button').click();
      await page.getByTestId('tx-type-select').click();
      await page.getByTestId('tx-type-income').click();
      await page.getByTestId('tx-amount-input').fill('200');
      await page.getByTestId('tx-category-select').click();
      await page.getByTestId('tx-category-option-other').click();
      await page.getByTestId('tx-description-input').fill('Patrocínio');
      await page.getByTestId('confirm-add-transaction-button').click();
      
      // Balance should be 150
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '150');
    });

    await test.step('3. Diarista Payout Flow', async () => {
      // Ensure owner is Diarista for this test
      await makeDiarista(page, orgName, owner.name);
      
      await page.goto('/');
      await page.getByTestId(`org-link-${orgName}`).click();
      const peladaId = await createPelada(page);
      
      // Attendance page
      const confirmBtn = page.getByTestId('attendance-confirm-button');
      await expect(confirmBtn).toBeVisible();
      await confirmBtn.click();
      
      // Wait for the card to move to confirmed tab
      await page.waitForTimeout(3000);
      
      // Check if players are visible, try Waitlist tab if Confirmed is empty
      let allPlayerNames = await page.locator('[data-testid^="attendance-card-"]').all();
      if (allPlayerNames.length === 0) {
        await page.getByRole('tab', { name: /Waitlist|Lista de Espera/i }).click();
        await page.waitForTimeout(1000);
        allPlayerNames = await page.locator('[data-testid^="attendance-card-"]').all();
      }
      
      // Mark as paid in attendance list
      const playerCard = page.getByTestId(`attendance-card-${owner.username}`);
      await expect(playerCard).toBeVisible({ timeout: 15000 });
      const paidBtn = playerCard.getByTestId('mark-as-paid-button');
      await expect(paidBtn).toBeVisible();
      
      // Wait for any pending dashboard-data requests to complete before clicking
      const dashboardDataPromise = page.waitForResponse(
        response => {
          const url = response.url();
          return (url.includes('dashboard-data') || url.includes('full-details')) && response.status() === 200;
        },
        { timeout: 30000 }
      );
      
      await paidBtn.click();
      
      // Wait for the dashboard data to be refreshed after the transaction is added
      try {
        await dashboardDataPromise;
      } catch (e) {
        // Silently continue if promise fails
      }
      
      // Wait a bit for state updates
      await page.waitForTimeout(500);
      
      // Verify icon changed to paid (PaidIcon)
      await expect(playerCard.getByTestId('paid-icon')).toBeVisible({ timeout: 10000 });
      
      // Go back to Org Finance and check transaction
      await navigateToOrgManagement(page, orgName);
      await page.getByTestId('mgmt-tab-finance').click();
      await page.getByTestId('finance-tab-transactions').click();
      
      await expect(page.getByText(new RegExp(`Pagamento Pelada ${peladaId}`))).toBeVisible();
      // Price was 25, balance was 150 -> 175
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '175');
    });

    await test.step('4. Mensalista Monthly Fee Flow', async () => {
      await makeMensalista(page, owner.name);
      
      await page.getByTestId('mgmt-tab-finance').click();
      await page.getByTestId('finance-tab-monthly').click();
      
      // Should see the player in the list as pending
      const playerRow = page.getByTestId(/monthly-payment-row-/).filter({ hasText: owner.name });
      await expect(playerRow.getByTestId('status-pending')).toBeVisible();
      
      // Mark as paid
      await playerRow.getByTestId('mark-payment-button').click();
      
      // Verify status change
      await expect(playerRow.getByTestId('status-paid')).toBeVisible();
      
      // Verify transaction added (100.00)
      await page.getByTestId('finance-tab-transactions').click();
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      await expect(page.getByText(new RegExp(`Mensalidade ${currentMonth}/${currentYear}`))).toBeVisible();
      
      // Balance was 175 -> 275
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '275');
    });

    await test.step('5. Mensalista Monthly Fee Reversal', async () => {
      await page.getByTestId('finance-tab-monthly').click();
      
      const playerRow = page.getByTestId(/monthly-payment-row-/).filter({ hasText: owner.name });
      await expect(playerRow.getByTestId('status-paid')).toBeVisible();
      
      // Click reverse button
      await playerRow.getByTestId('mark-payment-button').click();
      
      // Wait for confirmation dialog
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      
      // Confirm reversal - use button inside dialog
      await dialog.getByRole('button', { name: /estornar|reverse/i }).click();
      
      // Verify status change back to pending
      await expect(playerRow.getByTestId('status-pending')).toBeVisible();
      
      // Verify balance back to 175
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '175');
    });

    await ownerContext.close();
  });
});
