import { test, expect } from '@playwright/test';

test.describe('Phase 5: Post-Match & Analytics', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    email: `post-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Post Org ${timestamp}`;
  
  const invitedUser = {
    name: `Player ${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123'
  };

  test('should close pelada and cast votes', async ({ browser }) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: 'test-results/videos/' } } : {};
    // 1. Setup: Register, Org, Invite, Pelada, Attendance, Teams, Start (Consolidated for Phase 5)
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());
    
    await ownerPage.goto('/register');
    await ownerPage.getByTestId('register-name').fill(owner.name);
    await ownerPage.getByTestId('register-email').fill(owner.email);
    await ownerPage.getByTestId('register-password').fill(owner.password);
    await ownerPage.getByLabel('Position').click();
    await ownerPage.getByRole('option', { name: 'Defender' }).click();
    await ownerPage.getByTestId('register-submit').click();
    
    await ownerPage.getByTestId('create-org-open-dialog').click();
    await ownerPage.getByTestId('org-name-input').fill(orgName);
    await ownerPage.getByTestId('org-submit-button').click();
    await ownerPage.getByTestId(`org-link-${orgName}`).click();

    await ownerPage.getByTestId('org-management-button').click();
    await ownerPage.getByTestId('members-invite-button').click();
    await ownerPage.getByTestId('invite-email-input').fill(invitedUser.email);
    await ownerPage.getByTestId('send-invite-button').click();
    const invitationLinkText = await ownerPage.getByTestId('invitation-link-text').innerText();

    const invitedContext = await browser.newContext(videoOptions);
    const invitedPage = await invitedContext.newPage();
    await invitedPage.goto(invitationLinkText);
    await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
    await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
    await invitedPage.getByLabel('Position').click();
    await invitedPage.getByRole('option', { name: 'Striker' }).click();
    await invitedPage.getByTestId('first-access-submit').click();

    await ownerPage.goto('/');
    await ownerPage.getByTestId(`org-link-${orgName}`).click();
    await ownerPage.getByTestId('create-pelada-submit').click();
    
    // Wait for the attendance page URL to be stable
    await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/attendance/);
    const peladaId = ownerPage.url().split('/').find((s, i, a) => a[i-1] === 'peladas');
    if (!peladaId) throw new Error("Could not extract peladaId from URL: " + ownerPage.url());

    await ownerPage.getByTestId('attendance-confirm-button').click();
    await invitedPage.goto('/');
    await invitedPage.getByTestId(`pelada-link-${peladaId}`).click();
    await invitedPage.getByTestId('attendance-confirm-button').click();

    await ownerPage.reload();
    await ownerPage.waitForTimeout(2000);
    await ownerPage.getByTestId('close-attendance-button').click();
    await ownerPage.reload();
    await ownerPage.waitForTimeout(2000);
    await ownerPage.getByTestId('randomize-teams-button').click();
    await ownerPage.getByTestId('start-pelada-button').click();
    await ownerPage.getByTestId('confirm-start-pelada-button').click();

    // 2. End Match
    await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/matches/);
    await ownerPage.getByTestId('end-match-button').click();
    await expect(ownerPage.getByTestId('match-status-text')).toBeVisible();

    // 3. Close Pelada (opens voting)
    await ownerPage.getByTestId('close-pelada-button').click();
    await expect(ownerPage.getByText(/Pelada closed|Pelada encerrada/i)).toBeVisible();

    // 4. Voting: Owner votes for Player
    await ownerPage.goto(`/peladas/${peladaId}/voting`);
    // Rating component uses radio buttons internally usually, or clickable spans
    // Our Rating has data-testid="rating-ID"
    // Playwright can click the stars. 
    // Usually Rating renders 5 inputs or labels. Let's try clicking the 4th star.
    const ratingForPlayer = ownerPage.getByTestId(/rating-\d+/).first();
    // Material UI Rating uses 5 labels/inputs. We can just click the nth star.
    await ratingForPlayer.locator('label').nth(3).click(); // 4 stars
    await ownerPage.getByTestId('submit-votes-button').click();
    await expect(ownerPage.getByText(/Votes saved successfully|Votos registrados com sucesso/i)).toBeVisible();

    // 5. Voting: Player votes for Owner
    await invitedPage.goto(`/peladas/${peladaId}/voting`);
    const ratingForOwner = invitedPage.getByTestId(/rating-\d+/).first();
    await ratingForOwner.locator('label').nth(4).click(); // 5 stars
    await invitedPage.getByTestId('submit-votes-button').click();
    await expect(invitedPage.getByText(/Votes saved successfully|Votos registrados com sucesso/i)).toBeVisible();

    await ownerContext.close();
    await invitedContext.close();
  });
});
