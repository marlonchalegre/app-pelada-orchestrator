import { test, expect, type Page } from '@playwright/test';
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

test.describe('Voting Feature: Retention and Isolation', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `vote-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Vote Org ${timestamp}`;

  const invitedUser = {
    name: `Player ${timestamp}`,
    username: `user_invited_${timestamp}`,
    email: `vote-player-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  test('should retain casted votes and keep them isolated', async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};
    const invitedContext = await browser.newContext(videoOptions);
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    let invitedPage: Page | null = null;
    ownerPage.on('dialog', (dialog) => dialog.accept());

    let peladaId = '';

    await test.step('Setup Pelada and Players', async () => {
      await registerUser(ownerPage, owner);
      await createOrganization(ownerPage, orgName);

      invitedPage = await invitePlayerAndJoin(
        ownerPage,
        invitedContext,
        invitedUser,
        orgName,
      );

      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await createPeladaFromAgenda(ownerPage);

      const id = peladaIdFromUrl(ownerPage.url());
      if (!id) throw new Error('Could not extract peladaId');
      peladaId = id;

      await visible(ownerPage, 'attendance-confirm-button').click();
      await invitedPage.goto(`/peladas/${peladaId}/attendance`);
      await visible(invitedPage, 'attendance-confirm-button').click();
      await invitedPage.close();
      invitedPage = null;

      await ownerPage.reload();
      await closeAttendanceList(ownerPage);

      await drawAndStartPelada(ownerPage);
      await endCurrentMatch(ownerPage);
      await closeMatchReportSummary(ownerPage);
      await closePelada(ownerPage);
      await expect(
        visible(ownerPage, 'close-pelada-button'),
      ).not.toBeVisible({ timeout: 15000 });
    });

    await test.step('Owner votes and verifies retention', async () => {
      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      await submitVote(ownerPage, 4);

      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      await expect(
        ownerPage.getByText(/You have already voted|Você já votou/i),
      ).toBeVisible();
      await expect(
        ownerPage.locator('input[name^="player-"][type="radio"][value="4"]'),
      ).toBeChecked();
    });

    await test.step('Verify Isolation: Invited player should NOT see owner votes', async () => {
      invitedPage = await invitedContext.newPage();
      await invitedPage.goto(`/peladas/${peladaId}/voting`);

      await expect(
        invitedPage.getByText(/You have already voted|Você já votou/i),
      ).not.toBeVisible();
      await expect(
        invitedPage.locator('input[name^="player-"][type="radio"][value="4"]'),
      ).not.toBeChecked();

      await submitVote(invitedPage, 2);
    });

    await test.step('Final verification of independent retention', async () => {
      if (!invitedPage) throw new Error('invitedPage was not created');

      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      await expect(
        ownerPage.locator('input[name^="player-"][type="radio"][value="4"]'),
      ).toBeChecked();

      await invitedPage.goto(`/peladas/${peladaId}/voting`);
      await expect(
        invitedPage.locator('input[name^="player-"][type="radio"][value="2"]'),
      ).toBeChecked();
    });

    await invitedContext.close();
    await ownerContext.close();
    await saveVideo(ownerPage, 'vote-retention-owner', testInfo);
  });
});
