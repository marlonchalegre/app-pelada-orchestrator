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
  scoreGoalWithoutAssist,
  invitePlayerAndJoin,
  peladaIdFromUrl,
  visible,
} from './utils';

test.describe('Phase 4: Match Day', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `match-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Match Org ${timestamp}`;

  const invitedUser = {
    name: `Player ${timestamp}`,
    username: `user_invited_${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  test('should record match events and close pelada', async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};
    const ownerContext = await browser.newContext(videoOptions);
    const invitedContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', (dialog) => dialog.accept());

    let orgId = '';

    await test.step('Setup Owner and Org', async () => {
      await registerUser(ownerPage, owner);
      await createOrganization(ownerPage, orgName);
      orgId = ownerPage.url().split('/').pop() || '';
    });

    await test.step('Invite and Register Player', async () => {
      const invitedPage = await invitePlayerAndJoin(
        ownerPage,
        invitedContext,
        invitedUser,
        orgName,
      );
      await invitedPage.close();

      // Verify the player is actually in the org members list before proceeding
      await ownerPage.goto(`/organizations/${orgId}/management`);
      await expect(
        ownerPage.locator('li').filter({ hasText: invitedUser.name }),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('Create Pelada and Confirm Attendance', async () => {
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await createPeladaFromAgenda(ownerPage);

      const peladaId = peladaIdFromUrl(ownerPage.url());
      if (!peladaId) throw new Error('Could not extract peladaId');

      await visible(ownerPage, 'attendance-confirm-button').click();
      await expect(ownerPage.getByText('CONFIRMADOS 1')).toBeVisible();

      const invitedPage = await invitedContext.newPage();
      await invitedPage.goto(`/peladas/${peladaId}/attendance`);
      await visible(invitedPage, 'attendance-confirm-button').click();
      await invitedPage.close();

      await ownerPage.reload();
      await expect(ownerPage.getByText('CONFIRMADOS 2')).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('Start Match and Record Events', async () => {
      await closeAttendanceList(ownerPage);
      await drawAndStartPelada(ownerPage);

      await scoreGoalWithoutAssist(ownerPage, 'home', owner.name);
      await scoreGoalWithoutAssist(ownerPage, 'away', invitedUser.name);

      await expect(visible(ownerPage, 'match-score-display')).toHaveText(
        /1\s*[–\-x×]\s*1/,
        { timeout: 15000 },
      );

      await endCurrentMatch(ownerPage);
      await expect(visible(ownerPage, 'match-status-text')).toBeVisible({
        timeout: 15000,
      });
      await closeMatchReportSummary(ownerPage);
    });

    await test.step('Support lineup and share summary tabs', async () => {
      await visible(ownerPage, 'tab-support-lineup').click();
      await expect(
        ownerPage.locator('[data-testid^="support-lineup-row-"]').first(),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        visible(ownerPage, 'reroll-all-support-button'),
      ).toBeVisible();

      // Share summary now lives behind the export dropdown
      await visible(ownerPage, 'share-dropdown-button').click();
      await expect(
        ownerPage.getByText(/Compartilhar Resumo|Share Summary/i),
      ).toBeVisible();
      await ownerPage.keyboard.press('Escape');
    });

    await test.step('Close Pelada', async () => {
      await closePelada(ownerPage);
      await expect(
        visible(ownerPage, 'close-pelada-button'),
      ).not.toBeVisible({ timeout: 15000 });
    });

    await invitedContext.close();
    await ownerContext.close();

    await saveVideo(ownerPage, 'owner-match-day', testInfo);
  });
});
