import { test, expect } from '@playwright/test';
import {
  saveVideo,
  registerUser,
  createOrganization,
  createPeladaFromAgenda,
  closeAttendanceList,
  drawAndStartPelada,
  endCurrentMatch,
  closeMatchReportSummary,
  closePelada,
  invitePlayerAndJoin,
  submitVote,
  peladaIdFromUrl,
  visible,
} from './utils';

test.describe('Phase 5: Post-Match & Analytics', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `post-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Post Org ${timestamp}`;

  const invitedUser = {
    name: `Player ${timestamp}`,
    username: `user_invited_${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  test('should close pelada and cast votes', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};
    const invitedContext = await browser.newContext(videoOptions);
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', (dialog) => dialog.accept());

    await test.step('Owner Setup and Invitation', async () => {
      await registerUser(ownerPage, owner);
      await createOrganization(ownerPage, orgName);

      const invitedPage = await invitePlayerAndJoin(
        ownerPage,
        invitedContext,
        invitedUser,
        orgName,
      );

      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await createPeladaFromAgenda(ownerPage);

      const peladaId = peladaIdFromUrl(ownerPage.url());
      if (!peladaId)
        throw new Error(
          `Could not extract peladaId from URL: ${ownerPage.url()}`,
        );

      await visible(ownerPage, 'attendance-confirm-button').click();
      await invitedPage.goto(`/peladas/${peladaId}/attendance`);
      await visible(invitedPage, 'attendance-confirm-button').click();
      await invitedPage.close();

      await ownerPage.reload();
      await closeAttendanceList(ownerPage);
    });

    await test.step('Start, End Match and Vote', async () => {
      await drawAndStartPelada(ownerPage);

      await endCurrentMatch(ownerPage);
      await expect(visible(ownerPage, 'match-status-text')).toBeVisible({
        timeout: 15000,
      });
      await closeMatchReportSummary(ownerPage);

      await closePelada(ownerPage);

      const peladaId = peladaIdFromUrl(ownerPage.url());
      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      await submitVote(ownerPage, 4);
    });

    await invitedContext.close();
    await ownerContext.close();
    await saveVideo(ownerPage, 'owner-full-post-match', testInfo);
  });
});
