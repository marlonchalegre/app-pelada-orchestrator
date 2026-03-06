import { test, expect } from '@playwright/test';
import { saveVideo, acceptPendingInvitation } from './utils';

test.describe('Organization Management', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `owner_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const orgName = `LifeCycle Org ${timestamp}`;
  
  const invitedUser = {
    name: `Invited ${timestamp}`,
    username: `invited_${timestamp}`,
    email: `invited-${timestamp}-${Math.floor(Math.random() * 1000)}@example.com`,
    password: 'password123',
    position: 'Striker'
  };

  test('should manage organization, invitations, and admins', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    
    // Context for Owner
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());

    await test.step('1. Owner Registration & Org Creation', async () => {
      await ownerPage.goto('/register');
      await ownerPage.getByTestId('register-name').fill(owner.name);
      await ownerPage.getByTestId('register-username').fill(owner.username);
      await ownerPage.getByTestId('register-email').fill(owner.email);
      await ownerPage.getByTestId('register-password').fill(owner.password);
      await ownerPage.getByLabel('Position').click();
      await ownerPage.getByRole('option', { name: owner.position }).click();
      await ownerPage.getByTestId('register-submit').click();
      await expect(ownerPage).toHaveURL('/', { timeout: 10000 });

      await ownerPage.getByTestId('create-org-open-dialog').click();
      await ownerPage.getByTestId('org-name-input').fill(orgName);
      await ownerPage.getByTestId('org-submit-button').click();
      
      await expect(ownerPage.getByTestId(`org-link-${orgName}`)).toBeVisible();
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
    });

    await test.step('2. Personal Invitation & First Access Flow', async () => {
      await ownerPage.getByTestId('org-management-button').click();
      await ownerPage.getByTestId('members-invite-button').click();
      await ownerPage.getByTestId('invite-email-input').fill(invitedUser.email);
      await ownerPage.getByTestId('send-invite-button').click();
      
      await expect(ownerPage.getByTestId('invite-success-alert')).toBeVisible({ timeout: 15000 });
      const invitationLinkText = await ownerPage.getByTestId('invitation-link-text').innerText();
      expect(invitationLinkText).toContain('/first-access');

      // Invited User Flow
      const invitedContext = await browser.newContext(videoOptions);
      const invitedPage = await invitedContext.newPage();
      await invitedPage.goto(invitationLinkText);

      await expect(invitedPage.getByTestId('first-access-email')).toHaveValue(invitedUser.email);
      await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
      await invitedPage.getByTestId('first-access-username').fill(invitedUser.username);
      await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
      await invitedPage.getByTestId('first-access-position-select').click();
      await invitedPage.getByRole('option', { name: invitedUser.position }).click();
      await invitedPage.getByTestId('first-access-submit').click();

      await expect(invitedPage).toHaveURL('/');
      await acceptPendingInvitation(invitedPage, orgName);
      
      await invitedContext.close();
      await saveVideo(invitedPage, 'invited-player-registration', testInfo);
    });

    await test.step('3. Admin Management & Revoke', async () => {
      // Refresh to see new member
      await ownerPage.reload();
      await expect(ownerPage.getByTestId('admin-select')).toBeVisible({ timeout: 15000 });
      await ownerPage.getByTestId('admin-select').click();
      await ownerPage.getByRole('option', { name: invitedUser.name }).click();
      await ownerPage.getByTestId('add-admin-button').click();
      await expect(ownerPage.locator(`text=${invitedUser.name}`).last()).toBeVisible();

      // Test Revoke dummy invitation
      await ownerPage.getByTestId('members-invite-button').click();
      const dummyEmail = `dummy-${timestamp}@example.com`;
      await expect(ownerPage.getByTestId('invite-email-input')).toBeVisible();
      await ownerPage.getByTestId('invite-email-input').fill(dummyEmail);
      await ownerPage.getByTestId('send-invite-button').click();
      await expect(ownerPage.getByTestId('invite-success-alert')).toBeVisible();
      
      // Close dialog via escape
      await ownerPage.keyboard.press('Escape');
      await expect(ownerPage.getByRole('dialog')).toBeHidden();

      const revokeBtn = ownerPage.locator('li').filter({ hasText: dummyEmail }).getByTestId(/^revoke-invitation-/);
      await revokeBtn.click();
      await expect(revokeBtn).toBeHidden({ timeout: 10000 });
    });

    await test.step('4. Public Link & Leave Flow', async () => {
      await ownerPage.getByTestId('members-invite-button').click();
      await ownerPage.getByTestId('generate-public-link-button').click();
      const publicLinkText = await ownerPage.getByTestId('public-invite-link-text').innerText();
      const publicLink = publicLinkText.trim();
      
      const joinerContext = await browser.newContext(videoOptions);
      const joinerPage = await joinerContext.newPage();
      
      const joiner = { name: `Joiner ${timestamp}`, username: `joiner_${timestamp}`, email: `joiner-${timestamp}@example.com`, password: 'password123' };
      await joinerPage.goto('/register');
      await joinerPage.getByTestId('register-name').fill(joiner.name);
      await joinerPage.getByTestId('register-username').fill(joiner.username);
      await joinerPage.getByTestId('register-email').fill(joiner.email);
      await joinerPage.getByTestId('register-password').fill(joiner.password);
      await joinerPage.getByTestId('register-submit').click();
      await expect(joinerPage).toHaveURL('/', { timeout: 10000 });
      
      await joinerPage.goto(publicLink);
      await expect(joinerPage.getByTestId('join-org-button')).toBeVisible({ timeout: 15000 });
      await joinerPage.getByTestId('join-org-button').click();
      await expect(joinerPage).toHaveURL(/\/organizations\/\d+/);

      // Leave Organization (Non-admins have the leave button directly in the detail page)
      await joinerPage.getByTestId('leave-org-button').click();
      await joinerPage.getByTestId('confirm-leave-org-button').click();
      await expect(joinerPage).toHaveURL('/', { timeout: 10000 });
      await expect(joinerPage.getByTestId(`org-link-${orgName}`)).not.toBeVisible();

      await joinerContext.close();
      await saveVideo(joinerPage, 'joiner-leave-flow', testInfo);
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'owner-org-management', testInfo);
  });
});
