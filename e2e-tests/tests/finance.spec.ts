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
    
    // Log all API responses to help debug issues
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/organizations') && url.includes('transactions')) {
        const status = response.status();
        console.log(`API Response: ${url.split('?')[0]} - Status: ${status}`);
      }
      if (url.includes('full-details') && response.status() === 200) {
        try {
          const body = await response.json();
          console.log(`Full-details response: pelada_transactions count = ${(body.pelada_transactions || []).length}`);
          if (body.pelada_transactions) {
            body.pelada_transactions.forEach((tx: any, idx: number) => {
              console.log(`  TX[${idx}]: player_id=${tx.player_id}, status=${tx.status}, category=${tx.category}, amount=${tx.amount}`);
            });
          }
        } catch (e) {
          console.log('Could not parse full-details response');
        }
      }
    });

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
      
      console.log("ON ATTENDANCE PAGE:", page.url());
      
      // Attendance page
      const confirmBtn = page.getByTestId('attendance-confirm-button');
      await expect(confirmBtn).toBeVisible();
      await confirmBtn.click();
      
      // Wait for the card to move to confirmed tab
      await page.waitForTimeout(3000);
      
      // Log tabs to see where we are
      const tabs = await page.getByRole('tab').allInnerTexts();
      console.log("TABS:", tabs);
      
      // Log all player names visible on page to see where they are
      let allPlayerNames = await page.locator('[data-testid^="attendance-card-"]').all();
      if (allPlayerNames.length === 0) {
        // Try Waitlist tab
        console.log("NO PLAYERS IN CONFIRMED, TRYING WAITLIST");
        await page.getByRole('tab', { name: /Waitlist|Lista de Espera/i }).click();
        await page.waitForTimeout(1000);
        allPlayerNames = await page.locator('[data-testid^="attendance-card-"]').all();
      }
      
      console.log("VISIBLE PLAYERS COUNT:", allPlayerNames.length);
      for (const p of allPlayerNames) {
        console.log("PLAYER:", await p.innerText());
      }
      
      // Mark as paid in attendance list
      const playerCard = page.getByTestId(`attendance-card-${owner.username}`);
      await expect(playerCard).toBeVisible({ timeout: 15000 });
      console.log("PLAYER CARD HTML:", await playerCard.evaluate(el => el.outerHTML));
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
        console.log("Dashboard data refreshed after marking paid");
      } catch (e) {
        console.log("Dashboard data promise timed out or failed - checking all requests");
      }
      
      // Wait a bit for state updates
      await page.waitForTimeout(500);
      
      // Verify icon changed to paid (PaidIcon)
      await expect(playerCard.getByTestId('paid-icon')).toBeVisible({ timeout: 10000 });
      
      // Go back to Org Finance and check transaction
      await page.getByTestId('org-management-button').click();
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

    await ownerContext.close();
  });
});
