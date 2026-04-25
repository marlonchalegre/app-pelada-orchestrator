import { test, expect } from '@playwright/test';
import { saveVideo, registerUser } from './utils';
import path from 'path';
import fs from 'fs';

test.describe('User Avatar Workflow', () => {
  const timestamp = Date.now();
  const user = {
    name: `Avatar User ${timestamp}`,
    username: `avatar_${timestamp}`,
    email: `avatar-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };

  test('should upload, view, and delete profile picture', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    // Create a dummy image for testing
    const testImagePath = path.join(__dirname, 'test-avatar.png');
    // Minimal valid 1x1 transparent PNG
    const pngBuffer = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082', 'hex');
    fs.writeFileSync(testImagePath, pngBuffer);

    await test.step('Registration', async () => {
      await registerUser(page, user);
    });

    await test.step('Navigate to Profile', async () => {
      await page.getByTestId('user-settings-button').click();
      await page.getByTestId('profile-menu-item').click();
      await expect(page).toHaveURL('/profile');
    });

    await test.step('Upload Avatar', async () => {
      // Find the file input
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.getByLabel(/upload picture|Foto de Perfil/i).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(testImagePath);

      // Wait for any success message or just check the img visibility
      await expect(page.getByText(/Profile picture updated|Foto de perfil atualizada/i)).toBeVisible({ timeout: 15000 });
      
      // Check if avatar image is visible in profile
      const profileAvatar = page.locator('main [data-testid="secure-avatar"] img');
      await expect(profileAvatar).toBeVisible();
    });

    await test.step('Verify Avatar in Header', async () => {
      // The header avatar should also be an <img> now
      const headerAvatar = page.locator('header [data-testid="secure-avatar"] img');
      await expect(headerAvatar).toBeVisible();
    });

    await test.step('Delete Avatar', async () => {
      await page.getByLabel(/delete picture/i).click();
      await expect(page.getByText(/Profile picture removed|Foto de perfil removida/i)).toBeVisible();
      
      // Avatar should revert to fallback (no <img> tag)
      const profileAvatarImg = page.locator('main [data-testid="secure-avatar"] img');
      await expect(profileAvatarImg).not.toBeVisible();
      
      const headerAvatarImg = page.locator('header [data-testid="secure-avatar"] img');
      await expect(headerAvatarImg).not.toBeVisible();
    });

    // Cleanup test file
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }

    await context.close();
    await saveVideo(page, 'avatar-workflow', testInfo);
  });
});
