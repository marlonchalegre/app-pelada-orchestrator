import { test, expect } from '@playwright/test';
import {
  registerAndCreateOrg,
  getOrgIdFromUrl,
} from './utils';

test.describe('Player Characteristics & Radar Graph Editor', () => {
  let admin: any;
  let orgName: string;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000);
    const timestamp = Date.now() + Math.floor(Math.random() * 1000);
    admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: 'password123',
      position: 'Defender',
    };
    orgName = `Radar Org ${timestamp}`;

    await registerAndCreateOrg(page, admin, orgName);
  });

  test('should open characteristics radar graph and update player characteristics as admin', async ({ page }) => {
    const orgId = getOrgIdFromUrl(page.url());
    
    // 1. Go to Organization Management Page
    await page.goto(`/organizations/${orgId}/management`);
    await page.waitForLoadState('networkidle');

    // 2. Click on the admin's own member click zone in the members section
    const clickZone = page.getByTestId(/^player-click-zone-/).first();
    await expect(clickZone).toBeVisible();
    await clickZone.click();

    // 3. Verify dialog is open and shows attributes
    const dialog = page.getByTestId('player-radar-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(admin.name)).toBeVisible();

    // 4. Focus and change sliders
    const passingSlider = dialog.getByTestId('slider-passing').locator('input');
    await expect(passingSlider).toBeVisible();
    await passingSlider.focus();
    await page.keyboard.press('ArrowRight'); // 1
    await page.keyboard.press('ArrowRight'); // 2
    await page.keyboard.press('ArrowRight'); // 3
    
    const shootingSlider = dialog.getByTestId('slider-shooting').locator('input');
    await expect(shootingSlider).toBeVisible();
    await shootingSlider.focus();
    await page.keyboard.press('ArrowRight'); // 1
    await page.keyboard.press('ArrowRight'); // 2
    await page.keyboard.press('ArrowRight'); // 3
    await page.keyboard.press('ArrowRight'); // 4
    await page.keyboard.press('ArrowRight'); // 5

    // 5. Save changes
    const saveButton = dialog.getByTestId('radar-dialog-save-button');
    await saveButton.click();

    // 6. Verify dialog closes
    await expect(dialog).toBeHidden();

    // 7. Click on the member click zone again to verify persistence
    await clickZone.click();
    await expect(dialog).toBeVisible();
    
    // Verify updated slider values have persisted
    await expect(passingSlider).toHaveValue('3');
    await expect(shootingSlider).toHaveValue('5');

    // 8. Close the dialog
    await dialog.getByRole('button', { name: /Cancelar|Cancel/i }).click();
    await expect(dialog).toBeHidden();
  });
});
