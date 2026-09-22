import { test, expect } from '@playwright/test';
import { saveVideo, registerUser, visible } from './utils';

test.describe('Phase 1: Identity & Profile', () => {
  const timestamp = Date.now();
  const user = {
    name: `Auth User ${timestamp}`,
    username: `user_${timestamp}`,
    email: `auth-${timestamp}@example.com`,
    password: 'password123',
    position: 'Midfielder',
  };

  test('should register, update profile, logout, log in and delete account', async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await test.step('Registration', async () => {
      await registerUser(page, user);
      await expect(page.getByTestId('home-stats-matches')).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId('home-stats-groups')).toBeVisible();
    });

    await test.step('Update Profile', async () => {
      await visible(page, 'user-settings-button').click();
      await visible(page, 'profile-menu-item').click();
      await expect(page).toHaveURL('/profile');
      await visible(page, 'edit-profile-button').click();
      const updatedName = `${user.name} Updated`;
      await visible(page, 'profile-name').fill(updatedName);
      await visible(page, 'profile-save-button').click();
      await expect(
        page.getByText(/Profile updated successfully|Perfil atualizado com sucesso/i),
      ).toBeVisible();
    });

    await test.step('Logout through the desktop header menu', async () => {
      await visible(page, 'user-settings-button').click();
      await visible(page, 'logout-menu-item').click();
      await expect(page).toHaveURL(/\/(login|$)/, { timeout: 10000 });
    });

    await test.step('Log back in', async () => {
      await page.getByTestId('login-email').fill(user.email);
      await page.getByTestId('login-password').fill(user.password);
      await page.getByTestId('login-submit').click();
      await expect(page).toHaveURL(/\/($|home)/, { timeout: 15000 });
    });

    await test.step('Delete Account', async () => {
      await visible(page, 'user-settings-button').click();
      await visible(page, 'profile-menu-item').click();
      await expect(page).toHaveURL('/profile');
      await visible(page, 'edit-profile-button').click();
      await visible(page, 'profile-delete-account-button').click();
      await visible(page, 'confirm-delete-account-button').click();
      await expect(page).toHaveURL(/(\/login|\/$)/, { timeout: 10000 });
    });

    await context.close();
    await saveVideo(page, 'auth-flow', testInfo);
  });
});
