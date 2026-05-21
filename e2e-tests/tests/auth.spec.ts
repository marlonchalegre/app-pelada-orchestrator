import { test, expect } from '@playwright/test';
import { saveVideo, registerUser } from './utils';
import path from 'path';
import fs from 'fs';

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
      await expect(page.getByTestId('profile-phone')).toHaveValue("(55) 11999-9999");

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
      await expect(page.getByTestId('profile-phone')).toHaveValue("(55) 11888-8888");
    });

    await test.step('Delete Account', async () => {
      await page.getByTestId('profile-delete-account-button').click();
      await page.getByTestId('confirm-delete-account-button').click();
      await expect(page).toHaveURL('/', { timeout: 10000 });
    });

    await context.close();
    await saveVideo(page, 'auth-flow', testInfo);
  });

  test('should register without phone and then add it in profile', async ({ browser }, testInfo) => {
    const ts = Date.now() + 1000;
    const userNoPhone = {
      name: `No Phone User ${ts}`,
      username: `nophone_${ts}`,
      email: `nophone-${ts}@example.com`,
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
      await expect(page.getByTestId('profile-phone')).toHaveValue("(55) 11777-7777");
    });

    await context.close();
    await saveVideo(page, 'auth-no-phone-flow', testInfo);
  });

  test('should upload, view, and delete profile picture', async ({ browser }, testInfo) => {
    const ts = Date.now() + 2000;
    const avatarUser = {
      name: `Avatar User ${ts}`,
      username: `avatar_${ts}`,
      email: `avatar-${ts}@example.com`,
      password: 'password123',
      position: 'Defender',
    };

    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    // Create a dummy image for testing
    const testImagePath = path.join(__dirname, 'test-avatar.png');
    // Minimal valid 1x1 transparent PNG
    const pngBuffer = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082', 'hex');
    fs.writeFileSync(testImagePath, pngBuffer);

    await test.step('Registration', async () => {
      await registerUser(page, avatarUser);
    });

    await test.step('Navigate to Profile', async () => {
      await page.getByTestId('user-settings-button').click();
      await page.getByTestId('profile-menu-item').click();
      await expect(page).toHaveURL('/profile');
    });

    await test.step('Upload Avatar', async () => {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.getByLabel(/upload picture|Foto de Perfil/i).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(testImagePath);

      await expect(page.getByTestId('profile-success-alert')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('profile-success-alert')).toContainText(/Profile picture updated|Foto de perfil atualizada/i);
      
      const profileAvatar = page.locator('main [data-testid="secure-avatar"] img');
      await expect(profileAvatar).toBeVisible();
    });

    await test.step('Verify Avatar in Header', async () => {
      const headerAvatar = page.locator('header [data-testid="secure-avatar"] img');
      await expect(headerAvatar).toBeVisible();
    });

    await test.step('Delete Avatar', async () => {
      await page.getByLabel(/delete picture/i).click();
      await expect(page.getByText(/Profile picture removed|Foto de perfil removida/i)).toBeVisible();
      
      const profileAvatarImg = page.locator('main [data-testid="secure-avatar"] img');
      await expect(profileAvatarImg).not.toBeVisible();
      
      const headerAvatarImg = page.locator('header [data-testid="secure-avatar"] img');
      await expect(headerAvatarImg).not.toBeVisible();
    });

    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }

    await context.close();
    await saveVideo(page, 'avatar-workflow', testInfo);
  });

  test('should complete the password reset flow', async ({ page }, testInfo) => {
    const ts = Date.now() + 3000;
    const resetUser = {
      name: `Reset User ${ts}`,
      username: `reset_${ts}`,
      email: `reset-${ts}@example.com`,
      password: 'old-password123',
      position: 'Striker',
    };

    await registerUser(page, resetUser);
    
    await page.getByTestId('user-settings-button').click();
    await page.getByTestId('logout-menu-item').click();
    await expect(page).toHaveURL('/');

    await page.goto('/login');
    await page.getByRole('link', { name: /Forgot your password|Esqueceu sua senha/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);

    await page.getByTestId('forgot-password-email').fill(resetUser.email);
    
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/auth/forgot-password') && response.status() === 200
    );
    
    await page.getByTestId('forgot-password-submit').click();
    await responsePromise;

    await expect(page.getByText(/If an account with (that|this) email exists|Se uma conta com este email existir/i)).toBeVisible({ timeout: 10000 });
    
    await page.goto('/reset-password?token=mock-token');
    
    await page.getByTestId('reset-password-input').fill('new-password123');
    await page.getByTestId('reset-password-confirm').fill('different-password');
    await page.getByTestId('reset-password-submit').click();
    await expect(page.getByText(/Passwords do not match|As senhas não coincidem/i)).toBeVisible();
    
    await saveVideo(page, 'password-reset-flow', testInfo);
  });

  test('should toggle password visibility in Login, Register, and Reset Password pages', async ({ page }) => {
    const testToggle = async (inputSelector: string) => {
      const input = page.getByTestId(inputSelector);
      const toggleButton = input.locator('..').getByRole('button');

      await expect(input).toHaveAttribute('type', 'password');
      await toggleButton.click();
      await expect(input).toHaveAttribute('type', 'text');
      await toggleButton.click();
      await expect(input).toHaveAttribute('type', 'password');
    };

    await page.goto('/login');
    await testToggle('login-password');

    await page.goto('/register');
    await testToggle('register-password');

    await page.goto('/reset-password?token=mock-token');
    await testToggle('reset-password-input');
    await testToggle('reset-password-confirm');
  });

  test.describe('Auth Redirection Bugs', () => {
    const generateUser = () => {
      const ts = Date.now() + Math.floor(Math.random() * 10000) + 4000;
      return {
        name: `Auth User ${ts}`,
        username: `user_${ts}`,
        email: `auth-${ts}@example.com`,
        password: 'password123',
        position: 'Midfielder',
      };
    };

    test('unauthenticated user should be redirected from protected page to welcome page', async ({ page }) => {
      await page.goto('/login');
      await page.evaluate(() => localStorage.clear());
      await page.goto('/home');
      await expect(page).toHaveURL(/\/$/);
    });

    test('authenticated user should be redirected from login page to home', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const redirectUser = generateUser();

      await registerUser(page, redirectUser);
      await expect(page).toHaveURL('/home');

      await page.goto('/login');
      await expect(page).toHaveURL('/home', { timeout: 10000 });
      
      await context.close();
    });

    test('authenticated user should be redirected from register page to home', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const redirectUser = generateUser();

      await registerUser(page, redirectUser);
      await expect(page).toHaveURL('/home');

      await page.goto('/register');
      await expect(page).toHaveURL('/home', { timeout: 10000 });

      await context.close();
    });

    test('user with invalid token should be redirected to welcome page', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/login');
      await page.evaluate(() => {
        localStorage.setItem('authToken', 'invalid-token-header.invalid-payload.invalid-signature');
        localStorage.setItem('authUser', JSON.stringify({ id: 1, name: 'Fake User', username: 'fake' }));
      });

      await page.goto('/home');
      await expect(page).toHaveURL(/\/$/);

      await context.close();
    });
  });
});
