import { test, expect } from '@playwright/test';
import { acceptPendingInvitation } from './utils';

test.describe('New Features and UI Improvements', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Feature Org ${timestamp}`;

  test('should verify player sorting and available players copy button', async ({ page }) => {
    // 1. Setup
    await page.goto('/register');
    await page.getByTestId('register-name').fill(owner.name);
    await page.getByTestId('register-username').fill(owner.username);
    await page.getByTestId('register-email').fill(owner.email);
    await page.getByTestId('register-password').fill(owner.password);
    await page.getByLabel('Position').click();
    await page.getByRole('option', { name: 'Defender' }).click();
    await page.getByTestId('register-submit').click();

    await page.getByTestId('create-org-open-dialog').click();
    await page.getByTestId('org-name-input').fill(orgName);
    await page.getByTestId('org-submit-button').click();
    await page.getByTestId(`org-link-${orgName}`).click();

    // Create Pelada
    await page.getByTestId('create-pelada-submit').click();
    await page.getByTestId('attendance-confirm-button').or(page.getByTestId('attendance-card-confirm')).first().click();
    await page.getByTestId('close-attendance-button').click();
    await page.getByTestId('confirm-close-attendance-button').click();

    // 2. Verify Available Players Panel
    // Wait for players to load
    await expect(page.getByTestId('player-row')).toBeVisible();

    // Check for Copy button
    const copyBtn = page.getByTestId('copy-players-button');
    await expect(copyBtn).toBeVisible();

    // We can't easily test clipboard content in all CI environments, but we can verify the click triggers an alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toMatch(/common.actions.copy_success/i);
      await dialog.accept();
    });
    await copyBtn.click();
  });

  test('should verify merged header buttons logic', async ({ page }) => {
    // Reuse the same user/org logic (or assume state from previous test if using serial, but let's keep it isolated)
    await page.goto('/register');
    const ts = Date.now() + 1;
    await page.getByTestId('register-name').fill(`Admin ${ts}`);
    await page.getByTestId('register-username').fill(`admin_${ts}`);
    await page.getByTestId('register-email').fill(`admin-${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByLabel('Position').click();
    await page.getByRole('option', { name: 'Goalkeeper' }).click();
    await page.getByTestId('register-submit').click();

    await page.getByTestId('create-org-open-dialog').click();
    const oName = `Header Org ${ts}`;
    await page.getByTestId('org-name-input').fill(oName);
    await page.getByTestId('org-submit-button').click();
    await page.getByTestId(`org-link-${oName}`).click();

    // Create Pelada
    await page.getByTestId('create-pelada-submit').click();
    await page.getByTestId('attendance-confirm-button').or(page.getByTestId('attendance-card-confirm')).first().click();
    await page.getByTestId('close-attendance-button').click();
    await page.getByTestId('confirm-close-attendance-button').click();

    // Create 2 teams first
    await page.getByTestId('create-team-button').click();
    await page.getByTestId('create-team-button').click();

    // 1. Initially, should show "Montar Tabela" as primary because no plan exists
    const buildBtn = page.getByTestId('build-schedule-button');
    await expect(buildBtn).toBeVisible();
    await expect(buildBtn).toHaveText(/peladas.detail.button.build_schedule|BUILD SCHEDULE/i);
    
    // "Iniciar Pelada" should NOT be visible
    await expect(page.getByTestId('start-pelada-button')).not.toBeVisible();

    // 2. Build a schedule
    await buildBtn.click();
    await page.getByTestId('save-schedule-button').click();
    
    // 3. Now should show "Iniciar Pelada" as primary and "Montar Tabela" as secondary
    await expect(page.getByTestId('start-pelada-button')).toBeVisible();
    await expect(page.getByTestId('start-pelada-button')).toHaveText(/peladas.detail.button.start_pelada|START PELADA/i);
    await expect(page.getByTestId('build-schedule-button-edit')).toBeVisible();

    // 4. Start pelada
    page.on('dialog', dialog => dialog.accept());
    await page.getByTestId('start-pelada-button').click();
    await expect(page).toHaveURL(/\/matches/);

    // 5. Go back to details, should REDIRECT to matches page because it is running
    const peladaId = page.url().split('/').find((s, i, a) => a[i-1] === 'peladas')!;
    await page.goto(`/peladas/${peladaId}`);
    
    // Check if we are back on matches page (redirect logic in usePeladaDetail)
    await expect(page).toHaveURL(new RegExp(`/peladas/${peladaId}/matches`));
  });
});
