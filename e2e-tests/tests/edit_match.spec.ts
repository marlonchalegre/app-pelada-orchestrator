import { test, expect } from '@playwright/test';
import { acceptPendingInvitation } from './utils';

test.describe('Edit Match Feature', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    email: `edit-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Edit Org ${timestamp}`;

  const invitedUser = {
    name: `Player ${timestamp}`,
    email: `player-edit-${timestamp}@example.com`,
    password: 'password123'
  };

  test('should allow editing a finished match and auto-select next', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const invitedContext = await browser.newContext();
    const page = await ownerContext.newPage();
    
    // Handle confirms automatically
    page.on('dialog', dialog => dialog.accept());

    await test.step('Setup Owner, Org and Invite Player', async () => {
      await page.goto('/register');
      await page.getByTestId('register-name').fill(owner.name);
      await page.getByTestId('register-username').fill(`user_edit_${timestamp}`);
      await page.getByTestId('register-email').fill(owner.email);
      await page.getByTestId('register-password').fill(owner.password);
      await page.getByLabel('Position').click();
      await page.getByRole('option', { name: 'Defender' }).click();
      await page.getByTestId('register-submit').click();
      
      await page.getByTestId('create-org-open-dialog').click();
      await page.getByTestId('org-name-input').fill(orgName);
      await page.getByTestId('org-submit-button').click();
      await page.getByTestId(`org-link-${orgName}`).click();
      
      await page.getByTestId('org-management-button').click();
      await page.getByTestId('members-invite-button').click();
      await page.getByTestId('invite-email-input').fill(invitedUser.email);
      await page.getByTestId('send-invite-button').click();
      
      const invitationLinkLocator = page.getByTestId('invitation-link-text');
      await invitationLinkLocator.waitFor({ state: 'visible' });
      const invitationLinkText = await invitationLinkLocator.innerText();

      const invitedPage = await invitedContext.newPage();
      await invitedPage.goto(invitationLinkText);
      await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
      await invitedPage.getByTestId('first-access-username').fill(`user_invited_edit_${timestamp}`);
      await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
      await invitedPage.getByLabel('Position').click();
      await invitedPage.getByRole('option', { name: 'Striker' }).click();
      await invitedPage.getByTestId('first-access-submit').click();
      
      await acceptPendingInvitation(invitedPage, orgName);
      await invitedPage.close();
    });

    await test.step('Confirm Attendance and Start Pelada', async () => {
      await page.goto('/');
      await page.getByTestId(`org-link-${orgName}`).click();
      await page.getByTestId('create-pelada-submit').click();
      await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/);
      
      await page.getByTestId('attendance-confirm-button').click();
      await page.getByTestId('close-attendance-button').click();
      
      await page.reload();
      await page.getByTestId('randomize-teams-button').click();
      await page.getByTestId('start-pelada-button').click();
      await page.getByTestId('confirm-start-pelada-button').click();

      await expect(page).toHaveURL(/\/peladas\/\d+\/matches/);
    });

    await test.step('Record initial stats and end match', async () => {
      const ownerRow = page.getByTestId(`player-row-${owner.name}`);
      await ownerRow.getByTestId('stat-goals-increment').click();
      await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('1');

      await page.getByTestId('end-match-button').click();
      
      // Verification: Should auto-select Seq 2 (since Seq 1 is now finished)
      await expect(page.getByText(/Seq 2:/).first()).toBeVisible();
    });

    await test.step('Go back to match 1 to edit', async () => {
      await page.getByText(/Seq 1:/).first().click();
      await expect(page.getByTestId('match-status-text')).toBeVisible();
      await page.getByTestId('edit-match-button').click();
      
      const ownerRow = page.getByTestId(`player-row-${owner.name}`);
      // Controls should be enabled now
      await expect(ownerRow.getByTestId('stat-goals-increment')).toBeEnabled();
      
      await ownerRow.getByTestId('stat-goals-increment').click();
      await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('2');
      
      await page.getByTestId('finish-editing-button').click();
      
      // Controls should be disabled again
      await expect(ownerRow.getByTestId('stat-goals-increment')).toBeDisabled();
      await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('2');
    });

    await test.step('Close pelada and verify edit button is gone', async () => {
      await page.getByTestId('close-pelada-button').click();
      await expect(page.getByText(/Pelada closed|Pelada encerrada/i)).toBeVisible();
      
      await expect(page.getByTestId('edit-match-button')).not.toBeVisible();
    });
  });
});
