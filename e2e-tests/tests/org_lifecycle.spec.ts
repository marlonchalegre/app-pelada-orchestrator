import { test, expect } from '@playwright/test';
import { saveVideo, acceptPendingInvitation } from './utils';

test.describe('Phase 2: Organization Lifecycle', () => {
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

  test('should manage organization and invitation flow', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    // Context for Owner
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();

    // 1. Owner Registration & Org Creation
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
    await ownerPage.getByTestId('org-management-button').click();
    await expect(ownerPage.locator('h4')).toContainText('Manage Organization');

    // 2. Personal Invitation Flow
    await ownerPage.getByTestId('members-invite-button').click();
    await ownerPage.getByTestId('invite-email-input').fill(invitedUser.email);
    await ownerPage.getByTestId('send-invite-button').click();
    
    // Wait for any success alert
    const successAlert = ownerPage.locator('[data-testid="invite-success-alert"], [data-testid="invite-existing-success-alert"]');
    await expect(successAlert.first()).toBeVisible({ timeout: 15000 });
    
    const isNewUser = await ownerPage.getByTestId('invite-success-alert').isVisible();
    
    if (isNewUser) {
      const invitationLinkLocator = ownerPage.getByTestId('invitation-link-text');
      await expect(invitationLinkLocator).toBeVisible({ timeout: 10000 });
      const invitationLinkText = await invitationLinkLocator.innerText();
      expect(invitationLinkText).toContain('/first-access');

      // 3. Invited User Flow (First Access)
      const invitedContext = await browser.newContext(videoOptions);
      const invitedPage = await invitedContext.newPage();
      await invitedPage.goto(invitationLinkText);

      // Verify email is pre-filled and disabled
      await expect(invitedPage.getByTestId('first-access-email')).toHaveValue(invitedUser.email);
      await expect(invitedPage.getByTestId('first-access-email')).toBeDisabled();

      await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
      await invitedPage.getByTestId('first-access-username').fill(invitedUser.username);
      await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
      await invitedPage.getByTestId('first-access-position-select').click();
      await invitedPage.getByRole('option', { name: invitedUser.position }).click();
      await invitedPage.getByTestId('first-access-submit').click();

      // Should land on home and see the invitation
      await expect(invitedPage).toHaveURL('/');
      
      // NEW: Accept the invitation
      await acceptPendingInvitation(invitedPage, orgName);
      
      // After acceptance, the organization should be in the sidebar/home list
      await invitedPage.goto('/');
      await expect(invitedPage.getByRole('link', { name: orgName })).toBeVisible();
      
      await invitedContext.close();
      await saveVideo(invitedPage, 'invited-player-registration', testInfo);
    } else {
      console.log("User already exists, skipping first access flow");
    }

    // 4. Public Link Flow
    await ownerPage.reload(); // Close previous dialog
    await ownerPage.getByTestId('members-invite-button').click();
    await ownerPage.getByTestId('generate-public-link-button').click();
    const publicLinkLocator = ownerPage.getByTestId('public-invite-link-text');
    await expect(publicLinkLocator).toBeVisible({ timeout: 10000 });
    const publicLink = await publicLinkLocator.innerText();
    expect(publicLink).toContain('/join/');

    const joinerContext = await browser.newContext(videoOptions);
    const joinerPage = await joinerContext.newPage();
    
    // Register joiner first
    const joiner = { 
      name: `Joiner ${timestamp}`, 
      username: `joiner_${timestamp}`,
      email: `joiner-${timestamp}@example.com`, 
      password: 'password123' 
    };
    await joinerPage.goto('/register');
    await joinerPage.getByTestId('register-name').fill(joiner.name);
    await joinerPage.getByTestId('register-username').fill(joiner.username);
    await joinerPage.getByTestId('register-email').fill(joiner.email);
    await joinerPage.getByTestId('register-password').fill(joiner.password);
    await joinerPage.getByTestId('register-submit').click();
    await expect(joinerPage).toHaveURL('/');
    
    // Go to public link
    await joinerPage.goto(publicLink);
    await expect(joinerPage.locator('h5')).toContainText(orgName);
    await joinerPage.getByTestId('join-org-button').click();
    await expect(joinerPage).toHaveURL(/\/organizations\/\d+/);

    // Cleanup contexts
    await joinerContext.close();
    await saveVideo(joinerPage, 'joiner-public-flow', testInfo);
    
    await ownerContext.close();
    await saveVideo(ownerPage, 'owner-org-lifecycle', testInfo);
  });
});
