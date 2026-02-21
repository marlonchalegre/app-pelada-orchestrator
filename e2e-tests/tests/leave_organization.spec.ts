import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('Leave Organization feature', () => {
  test.describe.configure({ mode: 'serial' });
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const orgName = `LeaveOrg Test ${timestamp}`;
  
  const player = {
    name: `Player ${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker'
  };

  test('should allow a player to leave an organization', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    
    // 1. Owner Registration & Org Creation
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    
    await ownerPage.goto('/register');
    await ownerPage.getByTestId('register-name').fill(owner.name);
    await ownerPage.getByTestId('register-email').fill(owner.email);
    await ownerPage.getByTestId('register-password').fill(owner.password);
    await ownerPage.getByLabel('Position').click();
    await ownerPage.getByRole('option', { name: owner.position }).click();
    await ownerPage.getByTestId('register-submit').click();
    await expect(ownerPage).toHaveURL('/');

    await ownerPage.getByTestId('create-org-open-dialog').click();
    await ownerPage.getByTestId('org-name-input').fill(orgName);
    await ownerPage.getByTestId('org-submit-button').click();
    await expect(ownerPage.getByTestId(`org-link-${orgName}`)).toBeVisible();
    
    // Owner should NOT see the leave button (since they are admin)
    await ownerPage.getByTestId(`org-link-${orgName}`).click();
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
    
    await playerPage.goto('/register');
    await playerPage.getByTestId('register-name').fill(player.name);
    await playerPage.getByTestId('register-email').fill(player.email);
    await playerPage.getByTestId('register-password').fill(player.password);
    await playerPage.getByLabel('Position').click();
    await playerPage.getByRole('option', { name: player.position }).click();
    await playerPage.getByTestId('register-submit').click();
    await expect(playerPage).toHaveURL('/');

    await playerPage.goto(publicLink);
    await playerPage.getByTestId('join-org-button').click();
    await expect(playerPage).toHaveURL(/\/organizations\/\d+/);

    // 3. Player Leaves Organization
    const leaveButton = playerPage.getByTestId('leave-org-button');
    await expect(leaveButton).toBeVisible();
    await leaveButton.click();
    
    // Confirmation dialog
    await expect(playerPage.getByRole('dialog')).toBeVisible();
    await playerPage.getByRole('button', { name: /Confirmar/i }).click();
    
    // Should be redirected to home
    await expect(playerPage).toHaveURL('/');
    
    // Organization should no longer be in the list
    await expect(playerPage.getByRole('link', { name: orgName })).not.toBeVisible();

    // Cleanup
    await playerContext.close();
    await ownerContext.close();
    
    await saveVideo(playerPage, 'player-leave-org', testInfo);
    await saveVideo(ownerPage, 'owner-cannot-leave', testInfo);
  });
});
