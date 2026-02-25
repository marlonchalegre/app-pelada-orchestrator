import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('Phase 7: Copy Utilities & Dialogs', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Copy Owner ${timestamp}`,
    email: `copy-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Copy Org ${timestamp}`;

  test('should click all copy and utility buttons', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();

    await ownerPage.goto('/register');
    await ownerPage.getByTestId('register-name').fill(owner.name);
    await ownerPage.getByTestId('register-username').fill(`user_${timestamp}`);
    await ownerPage.getByTestId('register-email').fill(owner.email);
    await ownerPage.getByTestId('register-password').fill(owner.password);
    await ownerPage.getByLabel('Position').click();
    await ownerPage.getByRole('option', { name: 'Defender' }).click();
    await ownerPage.getByTestId('register-submit').click();
    
    await ownerPage.getByTestId('create-org-open-dialog').click();
    await ownerPage.getByTestId('org-name-input').fill(orgName);
    await ownerPage.getByTestId('org-submit-button').click();
    await ownerPage.getByTestId(`org-link-${orgName}`).click();

    await ownerPage.getByTestId('org-management-button').click();
    
    // 1. Test Copy Public Link
    await ownerPage.getByTestId('members-invite-button').click();
    await ownerPage.getByTestId('generate-public-link-button').click();
    const copyPublicBtn = ownerPage.getByTestId('copy-public-link-button');
    await expect(copyPublicBtn).toBeVisible();
    await copyPublicBtn.click(); // Interaction

    // 2. Test Copy Personal Invitation Link
    await ownerPage.getByTestId('invite-email-input').fill(`other-${timestamp}@example.com`);
    await ownerPage.getByTestId('send-invite-button').click();
    const copyPersonalBtn = ownerPage.getByTestId('copy-invitation-link-button');
    await expect(copyPersonalBtn).toBeVisible();
    await copyPersonalBtn.click(); // Interaction

    // 3. Test Copy link from Invitations List
    // The previous action might have closed the dialog or kept it open. 
    // Usually, success alert is shown. Let's close dialog if needed or just wait.
    await ownerPage.keyboard.press('Escape'); 
    
    const copyFromListBtn = ownerPage.locator('[data-testid^="copy-link-"]').first();
    await expect(copyFromListBtn).toBeVisible();
    await copyFromListBtn.click(); // Interaction

    await ownerContext.close();
    await saveVideo(ownerPage, 'copy-utilities', testInfo);
  });
});
