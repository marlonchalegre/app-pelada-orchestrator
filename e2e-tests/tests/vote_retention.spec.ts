import { test, expect } from '@playwright/test';
import { saveVideo, acceptPendingInvitation } from './utils';

test.describe('Voting Feature: Retention and Isolation', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    email: `vote-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Vote Org ${timestamp}`;
  
  const invitedUser = {
    name: `Player ${timestamp}`,
    email: `vote-player-${timestamp}@example.com`,
    password: 'password123'
  };

  test('should retain casted votes and keep them isolated', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const invitedContext = await browser.newContext(videoOptions);
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    const invitedPage = await invitedContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());
    
    await test.step('Setup Pelada and Players', async () => {
      // Owner Register
      await ownerPage.goto('/register');
      await ownerPage.getByTestId('register-name').fill(owner.name);
      await ownerPage.getByTestId('register-username').fill(`user_${timestamp}`);
      await ownerPage.getByTestId('register-email').fill(owner.email);
      await ownerPage.getByTestId('register-password').fill(owner.password);
      await ownerPage.getByLabel('Position').click();
      await ownerPage.getByRole('option', { name: 'Defender' }).click();
      await ownerPage.getByTestId('register-submit').click();
      
      // Create Org
      await ownerPage.getByTestId('create-org-open-dialog').click();
      await ownerPage.getByTestId('org-name-input').fill(orgName);
      await ownerPage.getByTestId('org-submit-button').click();
      await ownerPage.getByTestId(`org-link-${orgName}`).click();

      // Invite Player
      await ownerPage.getByTestId('org-management-button').click();
      await ownerPage.getByTestId('members-invite-button').click();
      await ownerPage.getByTestId('invite-email-input').fill(invitedUser.email);
      await ownerPage.getByTestId('send-invite-button').click();
      
      const invitationLinkLocator = ownerPage.getByTestId('invitation-link-text');
      await invitationLinkLocator.waitFor({ state: 'visible' });
      const invitationLinkText = await invitationLinkLocator.innerText();

      // Invited User Register
      await invitedPage.goto(invitationLinkText);
      await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
      await invitedPage.getByTestId('first-access-username').fill(`user_invited_${timestamp}`);
      await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
      await invitedPage.getByLabel('Position').click();
      await invitedPage.getByRole('option', { name: 'Striker' }).click();
      await invitedPage.getByTestId('first-access-submit').click();
      await expect(invitedPage).toHaveURL('/');

      await acceptPendingInvitation(invitedPage, orgName);
      
      // Create Pelada
      await ownerPage.goto('/');
      await ownerPage.getByTestId(`org-link-${orgName}`).click();
      await ownerPage.getByTestId('create-pelada-submit').click();
      
      // Wait for the attendance page URL to be stable
      await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/attendance/);
      const peladaId = ownerPage.url().split('/').find((s, i, a) => a[i-1] === 'peladas');
      if (!peladaId) throw new Error("Could not extract peladaId");

      // Attendance
      await ownerPage.getByTestId('attendance-confirm-button').click();
      await invitedPage.goto(`/peladas/${peladaId}/attendance`);
      await invitedPage.getByTestId('attendance-confirm-button').click();

      await ownerPage.reload();
      await ownerPage.waitForTimeout(1000);
      await ownerPage.getByTestId('close-attendance-button').click();

      // Start and End Pelada
      await ownerPage.getByTestId('randomize-teams-button').click();
      await ownerPage.getByTestId('start-pelada-button').click();
      await ownerPage.getByTestId('confirm-start-pelada-button').click();
      await ownerPage.getByTestId('end-match-button').click();
      await ownerPage.getByTestId('close-pelada-button').click();
      await expect(ownerPage.getByText(/Pelada closed|Pelada encerrada/i)).toBeVisible();
    });

    const peladaId = ownerPage.url().split('/').find((s, i, a) => a[i-1] === 'peladas');

    await test.step('Owner votes and verifies retention', async () => {
      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      
      // Vote 4 stars for the other player
      const ratingForPlayer = ownerPage.getByTestId(/rating-\d+/).first();
      await ratingForPlayer.locator('label').nth(3).click(); // 4th star (0-indexed labels usually)
      
      await ownerPage.getByTestId('submit-votes-button').click();
      await expect(ownerPage.getByText(/Votes saved successfully|Votos registrados com sucesso/i)).toBeVisible();

      // Navigate back to voting page
      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      
      // Verify message about already voted
      await expect(ownerPage.getByText(/You have already voted|Você já votou/i)).toBeVisible();
      
      // Verify stars are retained (Rating value should be 4)
      const ratingInput = ownerPage.locator('input[name^="player-"][type="radio"][value="4"]');
      await expect(ratingInput).toBeChecked();
    });

    await test.step('Verify Isolation: Invited player should NOT see owner votes', async () => {
      await invitedPage.goto(`/peladas/${peladaId}/voting`);
      
      // Verify invited user has NOT voted
      await expect(invitedPage.getByText(/You have already voted|Você já votou/i)).not.toBeVisible();
      
      // Verify stars are EMPTY (no radio checked for 4)
      const ratingInput = invitedPage.locator('input[name^="player-"][type="radio"][value="4"]');
      await expect(ratingInput).not.toBeChecked();
      
      // Invited user votes 2 stars
      const ratingForOwner = invitedPage.getByTestId(/rating-\d+/).first();
      await ratingForOwner.locator('label').nth(1).click(); // 2 stars
      await invitedPage.getByTestId('submit-votes-button').click();
      await expect(invitedPage.getByText(/Votes saved successfully|Votos registrados com sucesso/i)).toBeVisible();
    });

    await test.step('Final verification of independent retention', async () => {
      // Owner still sees 4 stars
      await ownerPage.goto(`/peladas/${peladaId}/voting`);
      await expect(ownerPage.locator('input[name^="player-"][type="radio"][value="4"]')).toBeChecked();
      
      // Invited player still sees 2 stars
      await invitedPage.goto(`/peladas/${peladaId}/voting`);
      await expect(invitedPage.locator('input[name^="player-"][type="radio"][value="2"]')).toBeChecked();
    });

    await invitedContext.close();
    await ownerContext.close();
    await saveVideo(ownerPage, 'vote-retention-owner', testInfo);
    await saveVideo(invitedPage, 'vote-retention-player', testInfo);
  });
});
