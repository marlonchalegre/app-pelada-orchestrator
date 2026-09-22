import { test, expect } from '@playwright/test';
import {
  saveVideo,
  registerUser,
  createOrganization,
  createPeladaFromAgenda,
  closeAttendanceList,
  drawAndStartPelada,
  invitePlayerAndJoin,
  peladaIdFromUrl,
  visible,
} from './utils';

test.describe('Phase 3: Pelada Management', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `pelada-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Pelada Org ${timestamp}`;

  const invitedUser = {
    name: `Player ${timestamp}`,
    username: `user_invited_${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  test('should manage pelada lifecycle from creation to start', async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};
    const invitedContext = await browser.newContext(videoOptions);
    // Context for Owner
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', (dialog) => dialog.accept());

    await test.step('Owner Registration & Org Creation', async () => {
      await registerUser(ownerPage, owner);
      await createOrganization(ownerPage, orgName);
    });

    await test.step('Invite and Register Player', async () => {
      const invitedPage = await invitePlayerAndJoin(
        ownerPage,
        invitedContext,
        invitedUser,
        orgName,
      );

      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await createPeladaFromAgenda(ownerPage, 'Arena E2E · Quadra 1');
      await expect(ownerPage.getByText('Arena E2E · Quadra 1')).toBeVisible();

      const peladaId = peladaIdFromUrl(ownerPage.url());
      if (!peladaId) throw new Error('Could not extract peladaId');

      await visible(ownerPage, 'attendance-confirm-button').click();
      await expect(ownerPage.getByText('CONFIRMADOS 1')).toBeVisible();

      await invitedPage.goto(`/peladas/${peladaId}/attendance`);
      await visible(invitedPage, 'attendance-confirm-button').click();

      await ownerPage.reload();
      await expect(ownerPage.getByText('CONFIRMADOS 2')).toBeVisible({
        timeout: 15000,
      });

      await invitedContext.close();
      await saveVideo(invitedPage, 'invited-player-attendance', testInfo);
    });

    await test.step('Randomize and Start Pelada', async () => {
      const tabsNav = ownerPage.getByRole('navigation', {
        name: 'Pelada sub-navigation',
      });
      await expect(tabsNav).toBeVisible();
      await expect(
        tabsNav.getByRole('link', { name: /LISTA DE PRESENÇA/ }),
      ).toBeVisible();

      await closeAttendanceList(ownerPage);
      await expect(ownerPage.getByText('Sorteio de times')).toBeVisible();

      await drawAndStartPelada(ownerPage);

      await expect(
        ownerPage.getByRole('heading', { level: 4 }).first(),
      ).toContainText('Pelada #');
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'owner-pelada-management', testInfo);
  });
});
