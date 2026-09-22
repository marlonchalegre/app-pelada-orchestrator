import { test, expect } from '@playwright/test';
import { saveVideo, registerUser, createOrganization } from './utils';

test.describe('Leave Organization feature', () => {
  test.describe.configure({ mode: 'serial' });
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `owner_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `LeaveOrg Test ${timestamp}`;

  const player = {
    name: `Player ${timestamp}`,
    username: `player_${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  test('should allow a player to leave an organization', async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};

    // 1. Owner Registration & Org Creation
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();

    await registerUser(ownerPage, owner);
    await createOrganization(ownerPage, orgName);

    // Owner should NOT see the leave button (since they are admin)
    await expect(ownerPage.getByTestId('leave-org-button')).not.toBeVisible();

    // Invite player via public link
    await ownerPage.getByTestId('org-management-button').click();
    await ownerPage.getByTestId('members-invite-button').click();
    await ownerPage.getByTestId('generate-public-link-button').click();
    const publicLinkLocator = ownerPage.getByTestId('public-invite-link-text');
    await expect(publicLinkLocator).toBeVisible({ timeout: 10000 });
    const publicLink = await publicLinkLocator.innerText();

    // 2. Player Registration & Join
    const playerContext = await browser.newContext(videoOptions);
    const playerPage = await playerContext.newPage();

    await registerUser(playerPage, player);

    await playerPage.goto(publicLink);
    await playerPage.getByTestId('join-org-button').click();
    await expect(playerPage).toHaveURL(/\/organizations\/\d+/);

    // 3. Player Leaves Organization
    const leaveButton = playerPage.getByTestId('leave-org-button');
    await expect(leaveButton).toBeVisible();
    await leaveButton.click();

    // Confirmation dialog
    await expect(playerPage.getByRole('dialog')).toBeVisible();
    await playerPage.getByRole('button', { name: /Confirmar|Confirm/i }).click();

    // Should be redirected to home
    await expect(playerPage).toHaveURL('/');

    // Organization should no longer be in the list
    await expect(
      playerPage.getByRole('link', { name: orgName }),
    ).not.toBeVisible();

    // Cleanup
    await playerContext.close();
    await ownerContext.close();

    await Promise.all([
      saveVideo(playerPage, 'player-leave-org', testInfo),
      saveVideo(ownerPage, 'owner-cannot-leave', testInfo),
    ]);
  });
});
