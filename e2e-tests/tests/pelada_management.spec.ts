import { test, expect } from '@playwright/test';

test.describe('Phase 3: Pelada Management', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    email: `pelada-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Pelada Org ${timestamp}`;
  
  const invitedUser = {
    name: `Player ${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123'
  };

  test('should manage pelada lifecycle from creation to start', async ({ browser }) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: 'test-results/videos/' } } : {};
    // Context for Owner
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('console', msg => console.log('OWNER LOG:', msg.text()));
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

    // 2. Invite another player so we have at least 2 for teams
    await ownerPage.getByTestId('org-management-button').click();
    await ownerPage.getByTestId('members-invite-button').click();
    await ownerPage.getByTestId('invite-email-input').fill(invitedUser.email);
    await ownerPage.getByTestId('send-invite-button').click();
    const invitationLinkText = await ownerPage.getByTestId('invitation-link-text').innerText();

    // 3. Invited player completes registration
    const invitedContext = await browser.newContext(videoOptions);
    const invitedPage = await invitedContext.newPage();
    await invitedPage.goto(invitationLinkText);
    await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
    await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
    await invitedPage.getByLabel('Position').click();
    await invitedPage.getByRole('option', { name: 'Striker' }).click();
    await invitedPage.getByTestId('first-access-submit').click();
    await expect(invitedPage).toHaveURL('/');

    // 4. Owner creates a Pelada
    await ownerPage.goto('/'); // Back to home
    await ownerPage.getByTestId(`org-link-${orgName}`).click();
    
    // Ensure we are on org detail page and create button is visible
    const createPeladaBtn = ownerPage.getByTestId('create-pelada-submit');
    await createPeladaBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createPeladaBtn.click();
    
    // Should be on attendance page
    await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/attendance/);
    const peladaUrl = ownerPage.url();
    const peladaId = peladaUrl.split('/').find((s, i, a) => a[i-1] === 'peladas');

    // 5. Both players confirm attendance
    await ownerPage.getByTestId('attendance-confirm-button').click();
    await expect(ownerPage.getByTestId('stats-confirmed-count')).toHaveText('1');

    await invitedPage.goto('/');
    await invitedPage.getByTestId(`pelada-link-${peladaId}`).click();
    await invitedPage.getByTestId('attendance-confirm-button').click();
    await expect(invitedPage.getByTestId('stats-confirmed-count')).toHaveText('2');

    // 6. Owner closes attendance list
    await ownerPage.reload(); // Refresh to see confirmed players
    await ownerPage.waitForTimeout(3000); // Give it a moment to load admins list
    
    // Check if button is there, if not reload again (hack for flaky state)
    const closeBtn = ownerPage.getByTestId('close-attendance-button');
    if (!await closeBtn.isVisible()) {
      await ownerPage.reload();
      await ownerPage.waitForTimeout(3000);
    }
    await closeBtn.click();
    
    // Should be on Pelada Detail (Teams) page
    await expect(ownerPage).toHaveURL(/\/peladas\/\d+$/);
    await expect(ownerPage.locator('h5')).toContainText(/Match Teams|Times da Partida/i);

    // Extra reload here because isAdmin state might be stale
    await ownerPage.reload();
    await ownerPage.waitForTimeout(2000);

    // 7. Randomize Teams
    await ownerPage.getByTestId('randomize-teams-button').click();
    // Wait for teams to be populated (at least 2 teams created by default)
    // Default names are "Time 1", "Time 2" in the backend
    await expect(ownerPage.locator('text=Time 1')).toBeVisible();
    await expect(ownerPage.locator('text=Time 2')).toBeVisible();

    // 8. Start Pelada
    await ownerPage.getByTestId('start-pelada-button').click();
    await ownerPage.getByTestId('confirm-start-pelada-button').click();

    // Should be on Matches page
    await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/matches/);
    await expect(ownerPage.getByRole('heading', { level: 4 }).first()).toContainText('Pelada #');

    await ownerContext.close();
    await invitedContext.close();
  });
});
