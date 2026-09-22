import { test, expect } from '@playwright/test';
import {
  saveVideo,
  registerUser,
  createOrganization,
} from './utils';

test.describe('Phase 7: Copy Utilities & Dialogs', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Copy Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `copy-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Copy Org ${timestamp}`;

  test('should click all copy and utility buttons', async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();

    await registerUser(ownerPage, owner);
    await createOrganization(ownerPage, orgName);

    await ownerPage.getByTestId('org-management-button').click();

    // 1. Test Copy Public Link
    await ownerPage.getByTestId('members-invite-button').click();
    await ownerPage.getByTestId('generate-public-link-button').click();
    const copyPublicBtn = ownerPage.getByTestId('copy-public-link-button');
    await expect(copyPublicBtn).toBeVisible();
    await copyPublicBtn.click();

    // 2. Test Copy Personal Invitation Link
    await ownerPage
      .getByTestId('invite-email-input')
      .fill(`other-${timestamp}@example.com`);
    await ownerPage.getByTestId('send-invite-button').click();
    const copyPersonalBtn = ownerPage.getByTestId(
      'copy-invitation-link-button',
    );
    await expect(copyPersonalBtn).toBeVisible();
    await copyPersonalBtn.click();

    // 3. Test Copy link from Invitations List
    await ownerPage.keyboard.press('Escape');

    const copyFromListBtn = ownerPage
      .locator('[data-testid^="copy-link-"]')
      .first();
    await expect(copyFromListBtn).toBeVisible();
    await copyFromListBtn.click();

    await ownerContext.close();
    await saveVideo(ownerPage, 'copy-utilities', testInfo);
  });
});
