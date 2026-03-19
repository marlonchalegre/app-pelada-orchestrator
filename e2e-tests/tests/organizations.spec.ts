import { test, expect } from '@playwright/test';
import { saveVideo, acceptPendingInvitation, registerUser, createOrganization, invitePlayerByEmail } from './utils';

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
      await registerUser(ownerPage, owner);
      await createOrganization(ownerPage, orgName);
      await ownerPage.reload();
    });

    await test.step('2. Personal Invitation & First Access Flow', async () => {
      const invitationLinkText = await invitePlayerByEmail(ownerPage, invitedUser.email);
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
      
      // Navigate to Admins tab
      await ownerPage.getByTestId('mgmt-tab-admins').click();
      
      await expect(ownerPage.getByTestId('admin-select')).toBeVisible({ timeout: 15000 });
      await ownerPage.getByTestId('admin-select').click();
      await ownerPage.getByRole('option', { name: invitedUser.name }).click();
      await ownerPage.getByTestId('add-admin-button').click();
      await expect(ownerPage.locator(`text=${invitedUser.name}`).last()).toBeVisible();
      
      // Navigate to Members tab and test Diarista x Mensalista
      await ownerPage.getByTestId('mgmt-tab-members').click();
      const memberRow = ownerPage.locator('li').filter({ hasText: invitedUser.name });
      await memberRow.getByRole('combobox').click();
      await ownerPage.getByRole('option', { name: 'Mensalista' }).click();
      
      // Refresh to confirm the state was saved
      await ownerPage.reload();
      await ownerPage.getByTestId('mgmt-tab-members').click();
      await expect(ownerPage.locator('li').filter({ hasText: invitedUser.name }).getByRole('combobox')).toHaveText('Mensalista');
      
      // Navigate to Invitations tab
      await ownerPage.getByTestId('mgmt-tab-invitations').click();
      
      await ownerPage.getByTestId('invitations-invite-button').click();
      const dummyEmail = `dummy-${timestamp}@example.com`;
      await expect(ownerPage.getByTestId('invite-email-input')).toBeVisible();
      await ownerPage.getByTestId('invite-email-input').fill(dummyEmail);
      await ownerPage.getByTestId('send-invite-button').click();
      await expect(ownerPage.getByTestId('invite-success-alert')).toBeVisible();
      
      // Close dialog via test-id (more reliable than role button name in multilingual apps)
      const closeBtnId = 'invite-dialog-close-button';
      await ownerPage.getByTestId(closeBtnId).click({ force: true });
      
      // Wait for dialog to be hidden and also the modal backdrop
      await expect(ownerPage.getByRole('dialog')).toBeHidden({ timeout: 15000 });
      await ownerPage.waitForTimeout(2000); // Wait for backdrop removal and pointer events to return

      const revokeBtn = ownerPage.locator('li').filter({ hasText: dummyEmail }).getByTestId(/^revoke-invitation-/);
      await revokeBtn.click();
      await expect(revokeBtn).toBeHidden({ timeout: 10000 });
    });

    await test.step('4. Public Link & Leave Flow', async () => {
      // Navigate back to members tab
      await ownerPage.getByTestId('mgmt-tab-members').click();
      await ownerPage.getByTestId('members-invite-button').click();
      
      // The link should be fetched automatically now, but if button exists click it
      const genBtn = ownerPage.getByTestId('generate-public-link-button');
      if (await genBtn.isVisible({ timeout: 5000 })) {
        await genBtn.click();
      }
      
      await expect(ownerPage.getByTestId('public-invite-link-text')).toBeVisible({ timeout: 15000 });
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

      // Close the invite dialog on ownerPage
      await ownerPage.getByTestId('invite-dialog-close-button').click({ force: true });
      await expect(ownerPage.getByRole('dialog', { name: /invite/i })).toBeHidden({ timeout: 15000 });
      await ownerPage.waitForTimeout(2000);
    });

    await test.step('5. Public Link Reset and List Filtering', async () => {
      // Navigate to Invitations tab
      await ownerPage.getByTestId('mgmt-tab-invitations').click();
      
      // Verify public link is shown in the highlight box
      const publicLinkText = await ownerPage.getByTestId('public-invite-link-text').innerText();
      expect(publicLinkText).toContain('/join/');
      
      // Verify public link IS NOT shown in the pending invitations list
      // The pending list should be empty (since we revoked the dummy invite earlier)
      await expect(ownerPage.locator('li').filter({ hasText: /convite público|public invite/i })).toBeHidden();
      
      // Test Reset Link functionality
      await ownerPage.getByTestId('reset-public-link-button').click();
      
      // Verify PrettyConfirmDialog is shown
      await expect(ownerPage.getByRole('dialog')).toBeVisible();
      await expect(ownerPage.getByText(/tem certeza|are you sure/i)).toBeVisible();
      
      // Confirm reset
      await ownerPage.getByRole('button', { name: /redefinir|reset/i }).click();
      
      // Verify link changed
      const newPublicLinkText = await ownerPage.getByTestId('public-invite-link-text').innerText();
      expect(newPublicLinkText).toContain('/join/');
      expect(newPublicLinkText).not.toBe(publicLinkText);
    });

    await test.step('6. Player Ratings Management', async () => {
      // Navigate to Ratings tab
      await ownerPage.getByTestId('mgmt-tab-ratings').click();
      
      // Find the invitedUser row in the ratings table
      const playerRow = ownerPage.locator('tr', { hasText: invitedUser.name });
      await expect(playerRow).toBeVisible();
      
      // Update rating to 8.5
      const ratingInput = playerRow.getByTestId(/^rating-input-/).locator('input');
      await ratingInput.fill('8.5');
      
      // Verify success snackbar and updated display
      await expect(ownerPage.getByText(/sucesso|success/i)).toBeVisible();
      const gradeDisplay = playerRow.getByTestId(/^grade-/);
      await expect(gradeDisplay).toHaveText('8.5');
    });

    await test.step('6. Delete Organization', async () => {
      // Navigate to Manage tab
      await ownerPage.getByTestId('mgmt-tab-settings').click();
      
      await ownerPage.getByTestId('delete-org-button').click();
      await ownerPage.getByTestId('confirm-org-name-input').fill(orgName);
      await ownerPage.getByTestId('confirm-delete-org-button').click();
      await expect(ownerPage).toHaveURL('/', { timeout: 10000 });
      await expect(ownerPage.getByTestId(`org-link-${orgName}`)).not.toBeVisible();
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'owner-org-management', testInfo);
  });
});
