import { test, expect } from '@playwright/test';

test.describe('Phase 4: Match Day', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    email: `match-owner-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Match Org ${timestamp}`;
  
  const invitedUser = {
    name: `Player ${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123'
  };

  test('should record match events and close pelada', async ({ browser }) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: 'test-results/videos/' } } : {};
    // 1. Setup: Register Owner and Create Org
    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    
    // Handle confirms automatically
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

    // 2. Setup: Invite and Register Player
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

    // 3. Setup: Create Pelada and Confirm Attendance
    await ownerPage.goto('/');
    await ownerPage.getByTestId(`org-link-${orgName}`).click();
    await ownerPage.getByTestId('create-pelada-submit').click();
    
    await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/attendance/);
    const peladaId = ownerPage.url().split('/').find((s, i, a) => a[i-1] === 'peladas');

    await ownerPage.getByTestId('attendance-confirm-button').click();
    await expect(ownerPage.getByTestId('stats-confirmed-count')).toHaveText('1');

    await invitedPage.goto('/');
    await invitedPage.getByTestId(`pelada-link-${peladaId}`).click();
    await invitedPage.getByTestId('attendance-confirm-button').click();
    await expect(invitedPage.getByTestId('stats-confirmed-count')).toHaveText('2');

    // 4. Setup: Randomize and Start
    await ownerPage.reload();
    await ownerPage.waitForTimeout(2000);
    await ownerPage.getByTestId('close-attendance-button').click();
    
    // We are on Teams page, randomize
    await ownerPage.reload();
    await ownerPage.waitForTimeout(2000);
    await ownerPage.getByTestId('randomize-teams-button').click();
    await ownerPage.getByTestId('start-pelada-button').click();
    await ownerPage.getByTestId('confirm-start-pelada-button').click();

    // 5. Match Day: Record Events
    await expect(ownerPage).toHaveURL(/\/peladas\/\d+\/matches/);
    
    // Record a goal for owner (Home Team usually)
    const ownerRow = ownerPage.getByTestId(`player-row-${owner.name}`);
    await ownerRow.getByTestId('stat-goals-increment').click();
    await expect(ownerRow.getByTestId('stat-goals-value')).toHaveText('1');
    
    // Record a goal and assist for invited player
    const playerRow = ownerPage.getByTestId(`player-row-${invitedUser.name}`);
    await playerRow.getByTestId('stat-goals-increment').click();
    await playerRow.getByTestId('stat-assists-increment').click();
    await expect(playerRow.getByTestId('stat-goals-value')).toHaveText('1');
    await expect(playerRow.getByTestId('stat-assists-value')).toHaveText('1');

    // 6. End Match
    await ownerPage.getByTestId('end-match-button').click();
    await expect(ownerPage.getByTestId('match-status-text')).toBeVisible({ timeout: 10000 });

    // 7. Close Pelada
    await ownerPage.getByTestId('close-pelada-button').click();
    await expect(ownerPage.getByText(/Pelada closed|Pelada encerrada/i)).toBeVisible({ timeout: 10000 });

    await ownerContext.close();
    await invitedContext.close();
  });
});
