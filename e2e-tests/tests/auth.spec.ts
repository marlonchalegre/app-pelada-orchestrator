import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('Phase 1: Identity & Profile', () => {
  const timestamp = Date.now();
  const user = {
    name: `Auth User ${timestamp}`,
    email: `auth-${timestamp}@example.com`,
    password: 'password123',
    newPassword: 'new-password456',
    position: 'Midfielder',
    newPosition: 'Goalkeeper'
  };

  test('should register, login, update profile, and logout', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await test.step('Registration', async () => {
      await page.goto('/register');
      await page.getByTestId('register-name').fill(user.name);
      await page.getByTestId('register-email').fill(user.email);
      await page.getByTestId('register-password').fill(user.password);
      await page.getByLabel('Position').click();
      await page.getByRole('option', { name: user.position }).click();
      await page.getByTestId('register-submit').click();
      await expect(page).toHaveURL('/', { timeout: 10000 });
    });

    await test.step('Update Profile', async () => {
      await page.getByTestId('user-settings-button').click();
      await page.getByTestId('profile-menu-item').click();
      await expect(page).toHaveURL('/profile');
      const updatedName = `${user.name} Updated`;
      await page.getByTestId('profile-name').fill(updatedName);
      await page.getByTestId('profile-save-button').click();
      await expect(page.getByText(/Profile updated successfully/i)).toBeVisible();
    });

    await test.step('Delete Account', async () => {
      await page.getByTestId('profile-delete-account-button').click();
      await page.getByTestId('confirm-delete-account-button').click();
      await expect(page).toHaveURL('/login', { timeout: 10000 });
    });

    await context.close();
    await saveVideo(page, 'auth-flow', testInfo);
  });
});
