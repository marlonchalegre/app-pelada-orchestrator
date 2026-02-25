import { test, expect } from '@playwright/test';
import { saveVideo, acceptPendingInvitation } from './utils';

test.describe('Phase 6: Admin Management & Edge Cases', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Admin Owner ${timestamp}`,
    email: `admin-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Admin Org ${timestamp}`;
  
  const playerToPromote = {
    name: `To Promote ${timestamp}`,
    email: `promote-${timestamp}@example.com`,
    password: 'password123'
  };

  test('should manage admins and test attendance decline', async ({ browser }, testInfo) => {
    test.setTimeout(60000);
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());

    await test.step('Register Owner and Create Org', async () => {
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
    });

    await test.step('Invite player to promote later', async () => {
      await ownerPage.getByTestId('org-management-button').click();
      await ownerPage.getByTestId('members-invite-button').click();
      await ownerPage.getByTestId('invite-email-input').fill(playerToPromote.email);
      await ownerPage.getByTestId('send-invite-button').click();
      
      const invitationLinkLocator = ownerPage.getByTestId('invitation-link-text');
      await invitationLinkLocator.waitFor({ state: 'visible' });
      const invitationLink = await invitationLinkLocator.innerText();

      const invitedContext = await browser.newContext(videoOptions);
      const invitedPage = await invitedContext.newPage();
      await invitedPage.goto(invitationLink);
      await invitedPage.getByTestId('first-access-name').fill(playerToPromote.name);
      await invitedPage.getByTestId('first-access-username').fill(`user_promote_${timestamp}`);
      await invitedPage.getByTestId('first-access-password').fill(playerToPromote.password);
      await invitedPage.getByLabel('Position').click();
      await invitedPage.getByRole('option', { name: 'Striker' }).click();
      await invitedPage.getByTestId('first-access-submit').click();
      await expect(invitedPage).toHaveURL('/');

      // NEW: Accept invitation
      await acceptPendingInvitation(invitedPage, orgName);
      
      await invitedContext.close();
      await saveVideo(invitedPage, 'invited-player-registration', testInfo);
    });

    await test.step('Test Attendance Decline', async () => {
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await ownerPage.getByTestId('create-pelada-submit').click();
      
      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/attendance/);
      const peladaId = ownerPage.url().split('/').find((s, i, a) => a[i-1] === 'peladas');

      await ownerPage.getByTestId('attendance-decline-button').click();
      await expect(ownerPage.getByTestId('stats-declined-count')).toHaveText('1');

      await ownerPage.getByTestId('close-attendance-button').click();
      await expect(ownerPage).toHaveURL(new RegExp(`/peladas/${peladaId}$`));
      
      await ownerPage.getByTestId('create-team-button').click();
      await expect(ownerPage.getByTestId('team-card-name').first()).toBeVisible();
    });

    await test.step('Test Admin Promotion', async () => {
      await ownerPage.getByLabel(/Back to Organization/i).click();
      await ownerPage.getByTestId('org-management-button').click();
      
      await ownerPage.getByTestId('admin-select').click();
      await ownerPage.getByRole('option', { name: playerToPromote.name }).click();
      await ownerPage.getByTestId('add-admin-button').click();
      
      await expect(ownerPage.locator(`text=${playerToPromote.name}`).last()).toBeVisible();
    });

    await test.step('Test Revoke Invitation', async () => {
      await ownerPage.getByTestId('members-invite-button').click();
      const dummyEmail = `dummy-${timestamp}@example.com`;
      await ownerPage.getByTestId('invite-email-input').fill(dummyEmail);
      await ownerPage.getByTestId('send-invite-button').click();
      
      // Explicitly wait for dialog to be stable then close
      await expect(ownerPage.getByTestId('invite-success-alert')).toBeVisible();
      await ownerPage.keyboard.press('Escape');
      await expect(ownerPage.getByRole('dialog')).toBeHidden();

      // Find the revoke button for our dummy email
      const revokeBtn = ownerPage.locator('li').filter({ hasText: dummyEmail }).getByTestId(/^revoke-invitation-/);
      await revokeBtn.click();
      // Wait for it to disappear instead of checking for text
      await expect(revokeBtn).toBeHidden({ timeout: 10000 });
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'owner-admin-management', testInfo);
  });
});
