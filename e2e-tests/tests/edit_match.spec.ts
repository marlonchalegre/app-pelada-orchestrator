import { test, expect } from '@playwright/test';
import {
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
  visible,
} from './utils';

test.describe('Edit Match Feature', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_edit_${timestamp}`,
    email: `edit-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Edit Org ${timestamp}`;

  const invitedUser = {
    name: `Player ${timestamp}`,
    username: `user_invited_edit_${timestamp}`,
    email: `player-edit-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  test('should allow editing a finished match', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const invitedContext = await browser.newContext();
    const page = await ownerContext.newPage();
    page.on('dialog', (dialog) => dialog.accept());

    try {
      await test.step('Setup Owner, Org and Invite Player', async () => {
        await registerUser(page, owner);
        await createOrganization(page, orgName);

        const invitedPage = await invitePlayerAndJoin(
          page,
          invitedContext,
          invitedUser,
          orgName,
        );
        await invitedPage.close();
      });

      await test.step('Confirm Attendance and Start Pelada', async () => {
        await page.goto('/');
        await page.getByTestId(`org-link-${orgName}`).click();
        await createPeladaFromAgenda(page);

        await visible(page, 'attendance-confirm-button').click();
        await closeAttendanceList(page);
        await drawAndStartPelada(page);
      });

      await test.step('Record initial goal and end match', async () => {
        await scoreGoalWithoutAssist(page, 'home', owner.name);
        await expect(visible(page, 'match-score-display')).toHaveText(
          /1\s*[–\-x×]\s*0/,
          { timeout: 15000 },
        );

        await endCurrentMatch(page);
        await closeMatchReportSummary(page);
      });

      await test.step('Go back to match 1 to edit', async () => {
        await visible(page, 'toggle-history-drawer').click();
        await visible(page, 'match-history-item-1').click();
        await expect(visible(page, 'match-status-text')).toBeVisible();

        await visible(page, 'edit-match-button').click();
        await scoreGoalWithoutAssist(page, 'home', owner.name);
        await expect(visible(page, 'match-score-display')).toHaveText(
          /2\s*[–\-x×]\s*0/,
          { timeout: 15000 },
        );

        await visible(page, 'finish-editing-button').click();
        await expect(visible(page, 'goal-button-home')).toHaveCount(0);
      });

      await test.step('Close pelada and verify edit button is gone', async () => {
        await closePelada(page);

        await expect(page.getByTestId('close-pelada-button')).toHaveCount(0);
        await expect(page.getByTestId('edit-match-button')).toHaveCount(0);
      });
    } finally {
      await invitedContext.close();
      await ownerContext.close();
    }
  });
});
