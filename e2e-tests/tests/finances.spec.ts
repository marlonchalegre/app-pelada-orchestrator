import { test, expect, Page } from '@playwright/test';
import {
  registerAndCreateOrg,
  createPelada,
  makeMensalista,
} from './utils';

async function navigateToOrgManagement(page: Page, orgName: string) {
  await page.goto('/home');
  await page.getByTestId(`org-link-${orgName}`).click();
  await expect(page.getByTestId('org-management-button')).toBeVisible();
  await page.getByTestId('org-management-button').click();
  
  await expect(page.getByTestId('org-mgmt-loading').or(page.getByTestId('org-mgmt-container'))).toBeVisible();
  
  if (await page.getByTestId('org-mgmt-loading').isVisible()) {
    await expect(page.getByTestId('org-mgmt-container')).toBeVisible({ timeout: 30000 });
  }
}

async function makeDiarista(page: Page, orgName: string, playerName: string) {
  await navigateToOrgManagement(page, orgName);
  await page.getByTestId('mgmt-tab-members').click();
  const memberRow = page.locator('li').filter({ hasText: playerName });
  await memberRow.getByRole('combobox').click();
  
  const responsePromise = page.waitForResponse(
    resp => resp.url().includes('/api/players/') && resp.request().method() === 'PUT' && resp.status() === 200,
    { timeout: 15000 }
  );
  
  await page.getByRole('option', { name: 'Diarista', exact: true }).click();
  await responsePromise;
}

async function goToFinanceTab(page: Page) {
  await page.getByTestId('mgmt-tab-finance').click();
  await expect(page.getByTestId('finance-loading')).not.toBeVisible({ timeout: 20000 });
}

test.describe('Financial Control & Fines', () => {
  test('should manage organization finances, transactions and payments', async ({ browser }) => {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    const owner = {
      name: `Owner Finance ${timestamp}`,
      username: `fin_owner_${timestamp}_${Math.floor(Math.random() * 10000)}`,
      email: `fin-owner-${timestamp}-${Math.floor(Math.random() * 10000)}@example.com`,
      password: 'password123',
      position: 'Defender'
    };
    const orgName = `Finance Org ${timestamp}`;

    const ownerContext = await browser.newContext();
    const page = await ownerContext.newPage();
    let peladaId: number;

    await test.step('1. Setup Org and Configure Prices', async () => {
      await registerAndCreateOrg(page, owner, orgName);
      
      await expect(page.getByTestId('org-management-button')).toBeVisible();
      await page.getByTestId('org-management-button').click();
      
      await expect(page.getByTestId('org-mgmt-loading').or(page.getByTestId('org-mgmt-container'))).toBeVisible();
      if (await page.getByTestId('org-mgmt-loading').isVisible()) {
        await expect(page.getByTestId('org-mgmt-container')).toBeVisible({ timeout: 30000 });
      }
      
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-config').click();
      
      const mensalistaInput = page.getByTestId('mensalista-price-input');
      const diaristaInput = page.getByTestId('diarista-price-input');
      
      await mensalistaInput.fill('100');
      await diaristaInput.fill('25');
      await page.getByTestId('monthly-fine-amount-input').fill('9');
      await page.getByTestId('monthly-cut-off-day-input').fill('5');
      
      await page.getByTestId('save-finance-config-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();
    });

    await test.step('2. Manual Transactions', async () => {
      await page.getByTestId('finance-tab-transactions').click();
      
      await page.getByTestId('add-transaction-button').click();
      await page.getByTestId('tx-type-select').click();
      await page.getByTestId('tx-type-expense').click();
      await page.getByTestId('tx-amount-input').fill('50');
      await page.getByTestId('tx-category-select').click();
      await page.getByTestId('tx-category-option-field_rent').click();
      await page.getByTestId('tx-description-input').fill('Aluguel quadra');
      await page.getByTestId('confirm-add-transaction-button').click();
      
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '-50');
      
      await page.getByTestId('add-transaction-button').click();
      await page.getByTestId('tx-type-select').click();
      await page.getByTestId('tx-type-income').click();
      await page.getByTestId('tx-amount-input').fill('200');
      await page.getByTestId('tx-category-select').click();
      await page.getByTestId('tx-category-option-other').click();
      await page.getByTestId('tx-description-input').fill('Patrocínio');
      await page.getByTestId('confirm-add-transaction-button').click();
      
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '150');
    });

    await test.step('3. Diarista Payout Flow', async () => {
      await makeDiarista(page, orgName, owner.name);
      
      await page.goto('/home');
      await page.getByTestId(`org-link-${orgName}`).click();
      peladaId = await createPelada(page);
      
      const confirmBtn = page.getByTestId('attendance-confirm-button');
      await expect(confirmBtn).toBeVisible();
      await confirmBtn.click();
      
      await page.waitForTimeout(3000);
      
      let allPlayerNames = await page.locator('[data-testid^="attendance-card-"]').all();
      if (allPlayerNames.length === 0) {
        await page.getByRole('tab', { name: /Waitlist|Lista de Espera/i }).click();
        await page.waitForTimeout(1000);
        allPlayerNames = await page.locator('[data-testid^="attendance-card-"]').all();
      }
      
      const playerCard = page.getByTestId(`attendance-card-${owner.username}`);
      await expect(playerCard).toBeVisible({ timeout: 15000 });
      const paidBtn = playerCard.getByTestId('mark-as-paid-button');
      await expect(paidBtn).toBeVisible();
      
      const dashboardDataPromise = page.waitForResponse(
        response => {
          const url = response.url();
          return (url.includes('dashboard-data') || url.includes('full-details')) && response.status() === 200;
        },
        { timeout: 30000 }
      );
      
      await paidBtn.click();
      
      try {
        await dashboardDataPromise;
      } catch (e) {
        // Silently continue
      }
      
      await page.waitForTimeout(500);
      await expect(playerCard.getByTestId('paid-icon')).toBeVisible({ timeout: 10000 });
      
      await navigateToOrgManagement(page, orgName);
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-transactions').click();
      
      await expect(page.getByText(/Pagamento Pelada \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '175');
    });

    await test.step('4. Mensalista Monthly Fee Flow', async () => {
      await makeMensalista(page, owner.name);
      
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-monthly').click();
      
      const playerRow = page.getByTestId(/monthly-payment-row-.*/).filter({ hasText: owner.name });
      await expect(playerRow.getByTestId('status-pending')).toBeVisible();
      
      await playerRow.getByTestId('mark-payment-button').click();
      
      if (new Date().getDate() > 5) {
        await page.getByTestId('confirm-mark-payment-button').click();
      }
      
      await expect(playerRow.getByTestId('status-paid')).toBeVisible();
      
      const fine = new Date().getDate() > 5 ? 9 : 0;

      await page.getByTestId('finance-tab-transactions').click();
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      await expect(page.getByText(`Mensalidade ${currentMonth}/${currentYear}`, { exact: true })).toBeVisible();
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', String(275 + fine));
    });

    await test.step('5. Mensalista Monthly Fee Reversal', async () => {
      await page.getByTestId('finance-tab-monthly').click();
      
      const playerRow = page.getByTestId(/monthly-payment-row-.*/).filter({ hasText: owner.name });
      await expect(playerRow.getByTestId('status-paid')).toBeVisible();
      
      await playerRow.getByTestId('mark-payment-button').click();
      
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      
      await dialog.getByRole('button', { name: /estornar|reverse/i }).click();
      await expect(playerRow.getByTestId('status-pending')).toBeVisible();
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '175');
    });

    await test.step('6. Diarista Fee Reversal Flow', async () => {
      await makeDiarista(page, orgName, owner.name);

      await page.goto(`/peladas/${peladaId}/attendance`);

      let playerCard = page.getByTestId(`attendance-card-${owner.username}`);
      if (!await playerCard.isVisible()) {
        await page.getByRole('tab', { name: /Waitlist|Lista de Espera/i }).click();
        await page.waitForTimeout(1000);
      }

      await expect(playerCard).toBeVisible();
      await expect(playerCard.getByTestId('paid-icon')).toBeVisible();
      
      await playerCard.getByTestId('reverse-payment-button').click();
      
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      
      await dialog.getByRole('button', { name: /estornar|reverse/i }).click();
      await expect(playerCard.getByTestId('mark-as-paid-button')).toBeVisible();
      
      await navigateToOrgManagement(page, orgName);
      await goToFinanceTab(page);
      
      await expect(page.getByTestId('summary-balance-value')).toHaveAttribute('data-amount', '150');
    });

    await ownerContext.close();
  });

  test.describe('Automatic Fine', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.install({ time: new Date('2026-05-06T12:00:00Z') });
    });

    test('should apply fine automatically after day 5', async ({ page }) => {
      const timestamp = Date.now() + Math.floor(Math.random() * 10000) + 10000;
      const fineOwner = {
        name: `Fine Owner ${timestamp}`,
        username: `fine_owner_${timestamp}`,
        email: `fine-owner-${timestamp}@example.com`,
        password: 'password123',
        position: 'Defender'
      };
      const fineOrgName = `Fine Org ${timestamp}`;

      await registerAndCreateOrg(page, fineOwner, fineOrgName);
      
      await page.getByTestId('org-management-button').click();
      await expect(page.getByTestId('org-mgmt-container')).toBeVisible();
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-config').click();
      
      await page.getByTestId('mensalista-price-input').fill('100');
      await page.getByTestId('monthly-fine-amount-input').fill('15');
      await page.getByTestId('monthly-cut-off-day-input').fill('5');
      
      await page.getByTestId('save-finance-config-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();

      await makeMensalista(page, fineOwner.name);

      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-monthly').click();

      await page.getByTestId('month-select').click();
      await page.getByTestId('month-option-5').click();
      await page.waitForLoadState('networkidle');

      const playerRow = page.getByTestId(/monthly-payment-row-.*/).filter({ hasText: fineOwner.name });
      await expect(playerRow.getByText(/[\$R]\s*115[,\.]00/)).toBeVisible({ timeout: 20000 });
      await expect(playerRow.getByText(/\+?[\$R]\s*15[,\.]00/)).toBeVisible();

      await page.getByTestId('finance-tab-config').click();
      await page.getByTestId('monthly-cut-off-day-input').fill('10');
      await page.getByTestId('save-finance-config-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();

      await page.getByTestId('finance-tab-monthly').click();
      await expect(playerRow.getByText(/[\$R]\s*100[,\.]00/)).toBeVisible();
      await expect(playerRow.locator('text=+ R$ 15,00 (multa)')).not.toBeVisible();

      await page.getByTestId('finance-tab-config').click();
      await page.getByTestId('monthly-cut-off-day-input').fill('5');
      await page.getByTestId('save-finance-config-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();
      
      await page.getByTestId('finance-tab-monthly').click();
      await playerRow.getByTestId('mark-payment-button').click();
      await page.getByTestId('confirm-mark-payment-button').click();
      await expect(playerRow.getByTestId('status-paid')).toBeVisible();

      await page.getByTestId('finance-tab-transactions').click();
      await expect(page.getByText('Mensalidade 5/2026', { exact: true })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Multa Mensalidade 5/2026', { exact: true })).toBeVisible();
      
      const txRow = page.locator('tr').filter({ hasText: 'Mensalidade 5/2026' }).filter({ hasNotText: 'Multa' });
      await expect(txRow.getByText(/[\$R]\s*100[,\.]00/)).toBeVisible();

      const fineRow = page.locator('tr').filter({ hasText: 'Multa Mensalidade 5/2026' });
      await expect(fineRow.getByText(/[\$R]\s*15[,\.]00/)).toBeVisible();
    });
  });

  test.describe('Manual Fine Control', () => {
    test('should allow admin to choose not to apply fine after deadline', async ({ page }) => {
      const timestamp = Date.now() + Math.floor(Math.random() * 10000) + 20000;
      const manualOwner = {
        name: `Manual Owner ${timestamp}`,
        username: `manual_owner_${timestamp}`,
        email: `manual-owner-${timestamp}@example.com`,
        password: 'password123',
        position: 'Defender'
      };
      const manualOrgName = `Manual Org ${timestamp}`;

      await registerAndCreateOrg(page, manualOwner, manualOrgName);
      
      await page.getByTestId('org-management-button').click();
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-config').click();
      
      await page.getByTestId('mensalista-price-input').fill('100');
      await page.getByTestId('monthly-fine-amount-input').fill('20');
      await page.getByTestId('monthly-cut-off-day-input').fill('1');
      
      await page.getByTestId('save-finance-config-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();

      await makeMensalista(page, manualOwner.name);

      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-monthly').click();

      const playerRow = page.getByTestId(/monthly-payment-row-.*/).filter({ hasText: manualOwner.name });
      await expect(playerRow.getByText(/[,\.]00/)).toHaveCount(2);

      await playerRow.getByTestId('mark-payment-button').click();
      await expect(page.getByTestId('mark-payment-dialog')).toBeVisible();
      
      await expect(page.getByTestId('apply-fine-checkbox').locator('input')).toBeChecked();
      
      await page.getByTestId('apply-fine-checkbox').click();
      await expect(page.getByTestId('apply-fine-checkbox').locator('input')).not.toBeChecked();
      
      await page.getByTestId('confirm-mark-payment-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();

      await expect(playerRow.getByTestId('status-paid')).toBeVisible();
      await expect(playerRow.getByText(/[\$R]\s*100[,\.]00/)).toBeVisible();
      await expect(playerRow.locator('text=+ R$ 20,00 (multa)')).not.toBeVisible();

      await page.getByTestId('finance-tab-transactions').click();
      const txRow = page.locator('tr').filter({ hasText: 'Mensalidade' });
      await expect(txRow.getByText(/[\$R]\s*100[,\.]00/)).toBeVisible();
      await expect(page.locator('tr').filter({ hasText: 'Multa Mensalidade' })).not.toBeVisible();
    });

    test('should still apply fine if admin leaves checkbox checked', async ({ page }) => {
      const timestamp = Date.now() + Math.floor(Math.random() * 10000) + 30000;
      const manualOwner = {
        name: `Manual Owner ${timestamp}`,
        username: `manual_owner_${timestamp}`,
        email: `manual-owner-${timestamp}@example.com`,
        password: 'password123',
        position: 'Defender'
      };
      const manualOrgName = `Manual Org ${timestamp}`;

      await registerAndCreateOrg(page, manualOwner, manualOrgName);
      
      await page.getByTestId('org-management-button').click();
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-config').click();
      await page.getByTestId('mensalista-price-input').fill('100');
      await page.getByTestId('monthly-fine-amount-input').fill('20');
      await page.getByTestId('monthly-cut-off-day-input').fill('1');
      await page.getByTestId('save-finance-config-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();

      await makeMensalista(page, manualOwner.name);
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-monthly').click();

      const playerRow = page.getByTestId(/monthly-payment-row-.*/).filter({ hasText: manualOwner.name });
      await playerRow.getByTestId('mark-payment-button').click();
      
      await page.getByTestId('confirm-mark-payment-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();

      await expect(playerRow.getByTestId('status-paid')).toBeVisible();
      await expect(playerRow.getByText(/[\$R]\s*120[,\.]00/)).toBeVisible();
      await expect(playerRow.getByText(/\+?[\$R]\s*20[,\.]00/)).toBeVisible();

      await page.getByTestId('finance-tab-transactions').click();
      await expect(page.locator('tr').filter({ hasText: 'Mensalidade' }).getByText(/[\$R]\s*100[,\.]00/)).toBeVisible();
      await expect(page.locator('tr').filter({ hasText: 'Multa Mensalidade' }).getByText(/[\$R]\s*20[,\.]00/)).toBeVisible();
    });

    test('should allow reversing the fine independently', async ({ page }) => {
      const timestamp = Date.now() + Math.floor(Math.random() * 10000) + 40000;
      const manualOwner = {
        name: `Manual Owner ${timestamp}`,
        username: `manual_owner_${timestamp}`,
        email: `manual-owner-${timestamp}@example.com`,
        password: 'password123',
        position: 'Defender'
      };
      const manualOrgName = `Manual Org ${timestamp}`;

      await registerAndCreateOrg(page, manualOwner, manualOrgName);
      await page.getByTestId('org-management-button').click();
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-config').click();
      await page.getByTestId('mensalista-price-input').fill('100');
      await page.getByTestId('monthly-fine-amount-input').fill('20');
      await page.getByTestId('monthly-cut-off-day-input').fill('1');
      await page.getByTestId('save-finance-config-button').click();
      await expect(page.getByTestId('finance-success')).toBeVisible();

      await makeMensalista(page, manualOwner.name);
      await goToFinanceTab(page);
      await page.getByTestId('finance-tab-monthly').click();

      const playerRow = page.getByTestId(/monthly-payment-row-.*/).filter({ hasText: manualOwner.name });
      await playerRow.getByTestId('mark-payment-button').click();
      await page.getByTestId('confirm-mark-payment-button').click();
      await expect(playerRow.getByTestId('status-paid')).toBeVisible();

      await page.getByTestId('finance-tab-transactions').click();
      await expect(page.locator('tr').filter({ hasText: 'Mensalidade' }).getByText(/[\$R]\s*100[,\.]00/)).toBeVisible();
      const fineRow = page.locator('tr').filter({ hasText: 'Multa Mensalidade' });
      await expect(fineRow.getByText(/[\$R]\s*20[,\.]00/)).toBeVisible();

      await fineRow.locator('[data-testclass="reverse-transaction-button"]').click();
      await page.getByTestId('pretty-confirm-button').click();
      
      await expect(page.getByTestId('finance-success')).toBeVisible();
      await expect(page.getByTestId('finance-success')).toContainText(/(sucesso|successfully)/i);

      await expect(fineRow.getByTestId('transaction-amount')).toHaveCSS('text-decoration-line', 'line-through');

      await page.getByTestId('finance-tab-monthly').click();
      await expect(playerRow.getByTestId('status-paid')).toBeVisible();
      await expect(playerRow.getByText(/[\$R]\s*100[,\.]00/)).toBeVisible();
      await expect(playerRow.locator('text=+ R$ 20,00 (multa)')).not.toBeVisible();
    });
  });
});
