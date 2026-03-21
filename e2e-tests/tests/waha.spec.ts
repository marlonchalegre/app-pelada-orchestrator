import { test, expect } from '@playwright/test';
import { saveVideo, registerAndCreateOrg } from './utils';

test.describe('WAHA Integration', () => {
  const timestamp = Date.now();
  const user = {
    name: `WAHA Admin ${timestamp}`,
    username: `waha_admin_${timestamp}`,
    email: `waha-${timestamp}@example.com`,
    password: 'password123',
    position: 'Goalkeeper'
  };
  const orgName = `WAHA Org ${timestamp}`;

  test('should configure WAHA settings', async ({ page }, testInfo) => {
    await registerAndCreateOrg(page, user, orgName);

    // Go to Management -> WAHA Tab
    await page.getByTestId('org-management-button').click();
    await page.getByTestId('mgmt-tab-waha').click();

    // Verify defaults
    const enabledSwitch = page.locator('input[name="waha_enabled"]');
    await expect(enabledSwitch).not.toBeChecked();
    const testBtn = page.getByTestId('waha-test-connection-button');
    await expect(testBtn).toBeDisabled();

    // Fill configuration
    await page.locator('input[name="waha_api_url"]').fill('http://waha:3000');
    await page.locator('input[name="waha_instance"]').fill('default');
    await page.locator('input[name="waha_group_id"]').fill('123456789@g.us');

    // Enable WAHA
    await page.getByLabel(/(Enable|Habilitar) WAHA/i).click();
    await expect(enabledSwitch).toBeChecked();

    // Enable notifications
    await page.getByLabel(/(Notify when pelada starts|Notificar quando a pelada iniciar)/i).click();
    await page.getByLabel(/(Notify when pelada ends|Notificar quando a pelada encerrar)/i).click();

    // Save
    await page.getByTestId('waha-save-button').click();
    await expect(page.getByText(/(saved successfully|salvas com sucesso)/i)).toBeVisible();
    await expect(testBtn).toBeEnabled();

    // Verify persistence
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
