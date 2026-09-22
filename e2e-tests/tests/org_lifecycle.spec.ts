import { test, expect } from '@playwright/test';
import {
  saveVideo,
  acceptPendingInvitation,
  registerUser,
  completeFirstAccess,
  createOrganization,
} from './utils';

test.describe('Phase 2: Organization Lifecycle', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `owner_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `LifeCycle Org ${timestamp}`;

  const invitedUser = {
    name: `Invited ${timestamp}`,
    username: `invited_${timestamp}`,
    email: `invited-${timestamp}-${Math.floor(Math.random() * 1000)}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  test('should manage organization, tabs, settings and invitation flow', async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};
    // Context for Owner
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    const groupTabs = ownerPage.getByRole('navigation', {
      name: 'Group sub-navigation',
    });

    // 1. Owner Registration & Org Creation
    await registerUser(ownerPage, owner);
    await createOrganization(ownerPage, orgName);

    await test.step('Desktop group tabs navigation', async () => {
      await ownerPage.getByTestId('org-management-button').click();
      await expect(ownerPage.getByTestId('org-mgmt-container')).toBeVisible();

      await expect(groupTabs).toBeVisible();

      await groupTabs.getByText('ESTATÍSTICAS').click();
      await expect(ownerPage).toHaveURL(/\/organizations\/\d+\/statistics/);

      await groupTabs.getByText('ELENCO').click();
      await expect(ownerPage).toHaveURL(/management\?tab=members/);
      await expect(ownerPage.getByTestId('mgmt-tab-members')).toBeVisible();

      await groupTabs.getByText('AJUSTES').click();
      await expect(ownerPage).toHaveURL(/management\?tab=settings/);
      await expect(ownerPage.getByTestId('mgmt-tab-settings')).toBeVisible();
    });

    await test.step('Set the organization default location', async () => {
      const locationInput = ownerPage.getByTestId(
        'default-location-autocomplete-input',
      );
      await expect(locationInput).toBeVisible({ timeout: 10000 });
      await locationInput.fill('Arena LifeCycle · Pista 2');
      await ownerPage.getByTestId('save-general-settings-btn').click();
      await expect(ownerPage.getByTestId('settings-save-success')).toBeVisible({
        timeout: 15000,
      });
      await expect(locationInput).toHaveValue('Arena LifeCycle · Pista 2');
    });

    // 2. Personal Invitation Flow
    await groupTabs.getByText('ELENCO').click();
    await expect(ownerPage).toHaveURL(/management\?tab=members/);
    await ownerPage.getByTestId('members-invite-button').click();
    await ownerPage.getByTestId('invite-email-input').fill(invitedUser.email);
    await ownerPage.getByTestId('send-invite-button').click();

    // Wait for any success alert
    const successAlert = ownerPage.locator(
      '[data-testid="invite-success-alert"], [data-testid="invite-existing-success-alert"]',
    );
    await expect(successAlert.first()).toBeVisible({ timeout: 15000 });

    const isNewUser = await ownerPage
      .getByTestId('invite-success-alert')
      .isVisible();

    if (isNewUser) {
      const invitationLinkLocator = ownerPage.getByTestId(
        'invitation-link-text',
      );
      await expect(invitationLinkLocator).toBeVisible({ timeout: 10000 });
      const invitationLinkText = await invitationLinkLocator.innerText();
      expect(invitationLinkText).toContain('/first-access');

      // 3. Invited User Flow (First Access)
      const invitedContext = await browser.newContext(videoOptions);
      const invitedPage = await invitedContext.newPage();
      await invitedPage.goto(invitationLinkText);

      // Verify email is pre-filled and disabled
      await expect(invitedPage.getByTestId('first-access-email')).toHaveValue(
        invitedUser.email,
      );
      await expect(
        invitedPage.getByTestId('first-access-email'),
      ).toBeDisabled();

      await completeFirstAccess(invitedPage, {
        name: invitedUser.name,
        username: invitedUser.username,
        password: invitedUser.password,
        position: invitedUser.position,
      });

      await acceptPendingInvitation(invitedPage, orgName);

      // After acceptance, the organization should be in the sidebar/home list
      await invitedPage.goto('/');
      await expect(
        invitedPage.getByRole('link', { name: orgName }),
      ).toBeVisible();

      await invitedContext.close();
      await saveVideo(invitedPage, 'invited-player-registration', testInfo);
    } else {
      console.log('User already exists, skipping first access flow');
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

    // Register joiner first (position optional on the public path)
    const joiner = {
      name: `Joiner ${timestamp}`,
      username: `joiner_${timestamp}`,
      email: `joiner-${timestamp}@example.com`,
      password: 'password123',
    };
    await registerUser(joinerPage, joiner);

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
