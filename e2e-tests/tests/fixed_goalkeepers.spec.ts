import { test, expect } from '@playwright/test';
import {
  saveVideo,
  registerUser,
  createOrganization,
  createPeladaFromAgenda,
  closeAttendanceList,
  visible,
} from './utils';

test.describe('Feature: Global Fixed Goalkeepers', () => {
  const timestamp = Date.now();
  const user = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: 'password123',
    position: 'Goalkeeper',
  };
  const orgName = `GK Club ${timestamp}`;

  test('should allow enabling fixed goalkeepers and starting the match', async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } }
      : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    try {
      await test.step('Setup: Register and Create Organization', async () => {
        await registerUser(page, user);
        await createOrganization(page, orgName);
      });

      await test.step('Create Pelada and manage attendance', async () => {
        await createPeladaFromAgenda(page);
        await visible(page, 'attendance-confirm-button').click();
        await closeAttendanceList(page);
      });

      await test.step('Enable fixed goalkeepers and draw teams', async () => {
        // The fixed-goalkeeper toggle lives in the mobile draw panel, so
        // shrink the viewport for this part of the flow.
        await page.setViewportSize({ width: 500, height: 900 });
        await page.reload();
        await expect(page.getByText('Sorteio de times')).toBeVisible({
          timeout: 15000,
        });

        const fixedGkSwitch = page.getByRole('checkbox', {
          name: 'Goleiros fixos',
        });
        await expect(fixedGkSwitch).toBeVisible();
        await fixedGkSwitch.check();

        // Draw with the mobile panel
        await page.getByText('SORTEAR DE NOVO').click();
        await expect(page.getByText(/BANCO/).first()).toBeVisible({
          timeout: 15000,
        });

        // Start the pelada (same StartPeladaDialog on mobile)
        await page.getByText('INICIAR PELADA').click();
        await visible(page, 'confirm-start-pelada-button').click();
        await expect(page).toHaveURL(/\/peladas\/\d+\/matches/, {
          timeout: 20000,
        });
      });

      await test.step('Verify Match Dashboard renders players', async () => {
        // Back to desktop for the dashboard assertions
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.reload();
        const playerRow = page
          .locator('[data-testid^="player-row-"]')
          .first();
        await expect(playerRow).toBeVisible({ timeout: 15000 });
        const playerName = await playerRow
          .getByTestId('player-name')
          .textContent();
        expect(playerName).toContain('Admin');
        // Position labels (ATA/GOL/ZAG/MEI) are rendered next to each player
        await expect(
          playerRow.getByTestId('player-position-label'),
        ).toBeVisible();
      });
    } finally {
      await context.close();
      await saveVideo(page, 'fixed-goalkeepers-final', testInfo);
    }
  });
});
