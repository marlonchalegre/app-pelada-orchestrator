import { test, expect } from '@playwright/test';
import { saveVideo, registerUser } from './utils';

test.describe('Auth & Profile', () => {
  const timestamp = Date.now();
  const user = {
    name: `Auth User ${timestamp}`,
    username: `user_${timestamp}`,
    email: `auth-${timestamp}@example.com`,
    password: 'password123',
    position: 'Midfielder',
  };

  test('should register, update profile, and delete account', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await test.step('Registration', async () => {
      await registerUser(page, user);
    });

    await test.step('Update Profile', async () => {
      await page.getByTestId('user-settings-button').click();
      await page.getByTestId('profile-menu-item').click();
      await expect(page).toHaveURL('/profile');

      await page.getByTestId('profile-name').fill(`${user.name} Updated`);
      await page.getByTestId('profile-save-button').click();
      await expect(page.getByText(/Profile updated successfully|Perfil atualizado com sucesso/i)).toBeVisible();
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
