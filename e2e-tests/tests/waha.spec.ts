import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('WAHA Integration', () => {
  const timestamp = Date.now();
  const user = {
    name: `WAHA Admin ${timestamp}`,
    username: `waha_admin_${timestamp}`,
    email: `waha-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `WAHA Org ${timestamp}`;

  test('should configure WAHA settings', async ({ page }, testInfo) => {
    // 1. Register and Create Org
    await page.goto('/register');
    await page.getByTestId('register-name').fill(user.name);
    await page.getByTestId('register-username').fill(user.username);
    await page.getByTestId('register-email').fill(user.email);
    await page.getByTestId('register-password').fill(user.password);
    await page.getByLabel('Position').click();
    await page.getByRole('option', { name: 'Goalkeeper' }).click();
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL('/', { timeout: 10000 });

    await page.getByTestId('create-org-open-dialog').click();
    await page.getByTestId('org-name-input').fill(orgName);
    await page.getByTestId('org-submit-button').click();
    await page.getByTestId(`org-link-${orgName}`).click();

    // 2. Go to Organization Management -> WAHA Tab
    await page.getByTestId('org-management-button').click();
    await page.getByTestId('mgmt-tab-waha').click();

    // 3. Verify defaults (should be disabled)
    const enabledSwitch = page.locator('input[name="waha_enabled"]');
    await expect(enabledSwitch).not.toBeChecked();
    
    // Test connection button should be disabled when WAHA is disabled
    const testBtn = page.getByTestId('waha-test-connection-button');
    await expect(testBtn).toBeDisabled();

    // 4. Fill configuration
    await page.locator('input[name="waha_api_url"]').fill('http://waha:3000');
    await page.locator('input[name="waha_instance"]').fill('default');
    await page.locator('input[name="waha_group_id"]').fill('123456789@g.us');
    
    // Enable WAHA
    await page.getByLabel(/(Enable|Habilitar) WAHA/i).click();
    await expect(enabledSwitch).toBeChecked();

    // Verify sub-options are visible when enabled
    await expect(page.getByLabel(/(Notify when pelada starts|Notificar quando a pelada iniciar)/i)).toBeVisible();
    
    // Enable some notifications
    await page.getByLabel(/(Notify when pelada starts|Notificar quando a pelada iniciar)/i).click();
    await page.getByLabel(/(Notify when pelada ends|Notificar quando a pelada encerrar)/i).click();

    // 5. Save configuration
    await page.getByTestId('waha-save-button').click();
    await expect(page.getByText(/(saved successfully|salvas com sucesso)/i)).toBeVisible();

    // 6. Test connection button should now be enabled
    await expect(testBtn).toBeEnabled();

    // 7. Refresh and verify settings persisted
    await page.reload();
    await page.getByTestId('mgmt-tab-waha').click();
    await expect(enabledSwitch).toBeChecked();
    await expect(page.locator('input[name="waha_api_url"]')).toHaveValue('http://waha:3000');
    await expect(page.locator('input[name="waha_instance"]')).toHaveValue('default');
    await expect(page.locator('input[name="waha_group_id"]')).toHaveValue('123456789@g.us');
    await expect(page.locator('input[name="waha_start_msg_enabled"]')).toBeChecked();
    await expect(page.locator('input[name="waha_end_msg_enabled"]')).toBeChecked();

    await saveVideo(page, 'waha-configuration', testInfo);
  });
});
