import { test, expect } from '@playwright/test';
import {
  saveVideo,
  registerUser,
  createOrganization,
  createPeladaFromAgenda,
  closeAttendanceList,
  invitePlayerAndJoin,
  visible,
} from './utils';

test.describe('Phase 6: Admin Management & Edge Cases', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Admin Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `admin-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Admin Org ${timestamp}`;

  const playerToPromote = {
    name: `To Promote ${timestamp}`,
    username: `user_promote_${timestamp}`,
    email: `promote-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  test('should manage admins and test attendance decline', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90000);
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};

    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', (dialog) => dialog.accept());

    await test.step('Register Owner and Create Org', async () => {
      await registerUser(ownerPage, owner);
      await createOrganization(ownerPage, orgName);
    });

    await test.step('Invite player to promote later', async () => {
      const invitedContext = await browser.newContext(videoOptions);
      const invitedPage = await invitePlayerAndJoin(
        ownerPage,
        invitedContext,
        playerToPromote,
        orgName,
      );

      await invitedContext.close();
      await saveVideo(invitedPage, 'invited-player-registration', testInfo);
    });

    await test.step('Test Attendance Decline', async () => {
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await createPeladaFromAgenda(ownerPage);

      await visible(ownerPage, 'attendance-decline-button').click();
      await expect(ownerPage.getByText('RECUSARAM 1')).toBeVisible();

      await closeAttendanceList(ownerPage);
      // Teams are created by the draw instead of a manual create button.
      await visible(ownerPage, 'draw-again-button').click();
      await expect(
        ownerPage.locator('[data-testid^="team-card-"]').first(),
      ).toBeVisible({ timeout: 15000 });
    });

    await test.step('Test Admin Promotion', async () => {
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await ownerPage.getByTestId('org-management-button').click();

      await ownerPage.getByTestId('admin-select').click();
      await ownerPage
        .getByRole('option', { name: playerToPromote.name })
        .click();
      await ownerPage.getByTestId('add-admin-button').click();

      await expect(ownerPage.getByText(playerToPromote.name).last()).toBeVisible();
    });

    await test.step('Test Revoke Invitation', async () => {
      await ownerPage.getByTestId('members-invite-button').click();
      const dummyEmail = `dummy-${timestamp}@example.com`;
      await ownerPage.getByTestId('invite-email-input').fill(dummyEmail);
      await ownerPage.getByTestId('send-invite-button').click();

      await expect(ownerPage.getByTestId('invite-success-alert')).toBeVisible();
      await ownerPage.keyboard.press('Escape');
      await expect(ownerPage.getByRole('dialog')).toBeHidden();

      const revokeBtn = ownerPage
        .locator('li')
        .filter({ hasText: dummyEmail })
        .getByTestId(/^revoke-invitation-/);
      await revokeBtn.click();
      await expect(revokeBtn).toBeHidden({ timeout: 10000 });
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'owner-admin-management', testInfo);
  });
});
