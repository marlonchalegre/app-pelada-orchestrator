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
    phone: '5511999999999',
  };

  test('should register, update profile (including phone), and delete account', async ({ browser }, testInfo) => {
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

      // Check initial values
      await expect(page.getByTestId('profile-name')).toHaveValue(user.name);
      await expect(page.getByTestId('profile-phone')).toHaveValue(user.phone);

      // Update values
      const updatedName = `${user.name} Updated`;
      const updatedPhone = '5511888888888';
      
      await page.getByTestId('profile-name').fill(updatedName);
      await page.getByTestId('profile-phone').fill(updatedPhone);
      
      await page.getByTestId('profile-save-button').click();
      await expect(page.getByText(/Profile updated successfully|Perfil atualizado com sucesso/i)).toBeVisible();

      // Verify persistence
      await page.reload();
      await expect(page.getByTestId('profile-name')).toHaveValue(updatedName);
      await expect(page.getByTestId('profile-phone')).toHaveValue(updatedPhone);
    });

    await test.step('Delete Account', async () => {
      await page.getByTestId('profile-delete-account-button').click();
      await page.getByTestId('confirm-delete-account-button').click();
      await expect(page).toHaveURL('/login', { timeout: 10000 });
    });

    await context.close();
    await saveVideo(page, 'auth-flow', testInfo);
  });

  test('should register without phone and then add it in profile', async ({ browser }, testInfo) => {
    const timestamp = Date.now() + 1000;
    const userNoPhone = {
      name: `No Phone User ${timestamp}`,
      username: `nophone_${timestamp}`,
      email: `nophone-${timestamp}@example.com`,
      password: 'password123',
    };

    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await test.step('Registration without Phone', async () => {
      await registerUser(page, userNoPhone);
    });

    await test.step('Add Phone in Profile', async () => {
      await page.getByTestId('user-settings-button').click();
      await page.getByTestId('profile-menu-item').click();
      await expect(page).toHaveURL('/profile');

      await expect(page.getByTestId('profile-phone')).toHaveValue('');

      const newPhone = '5511777777777';
      await page.getByTestId('profile-phone').fill(newPhone);
      await page.getByTestId('profile-save-button').click();
      await expect(page.getByText(/Profile updated successfully|Perfil atualizado com sucesso/i)).toBeVisible();

      await page.reload();
      await expect(page.getByTestId('profile-phone')).toHaveValue(newPhone);
    });

    await context.close();
    await saveVideo(page, 'auth-no-phone-flow', testInfo);
  });
});
