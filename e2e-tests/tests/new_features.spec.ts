import { test, expect } from '@playwright/test';
import { saveVideo, acceptPendingInvitation } from './utils';

test.describe('New Features: GK Stats, Admin Edit after Closed, Voting Stats', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Admin ${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    username: `admin_${timestamp}`,
    password: 'password123'
  };
  const orgName = `New Features Org ${timestamp}`;

  const invitedUser = {
    name: `Player ${timestamp}`,
    email: `player-${timestamp}@example.com`,
    username: `player_${timestamp}`,
    password: 'password123'
  };

  test('should support new features: GK summary, admin edit after closed, voting stats', async ({ browser }, testInfo) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());

    // 1. Setup Admin and Org
    await page.goto('/register');
    await page.getByTestId('register-name').fill(owner.name);
    await page.getByTestId('register-username').fill(owner.username);
    await page.getByTestId('register-email').fill(owner.email);
    await page.getByTestId('register-password').fill(owner.password);
    await page.getByLabel('Position').click();
    await page.getByRole('option', { name: 'Goalkeeper' }).click();
    await page.getByTestId('register-submit').click();

    await page.getByTestId('create-org-open-dialog').click();
    await page.getByTestId('org-name-input').fill(orgName);
    await page.getByTestId('org-submit-button').click();
    await page.getByTestId(`org-link-${orgName}`).click();

    // 1.1 Invite and Add another player
    await page.getByTestId('org-management-button').click();
    await page.getByTestId('members-invite-button').click();
    await page.getByTestId('invite-email-input').fill(invitedUser.email);
    await page.getByTestId('send-invite-button').click();
    
    const invitationLinkLocator = page.getByTestId('invitation-link-text');
    await invitationLinkLocator.waitFor({ state: 'visible' });
    const invitationLinkText = await invitationLinkLocator.innerText();

    const invitedContext = await browser.newContext();
    const invitedPage = await invitedContext.newPage();
    await invitedPage.goto(invitationLinkText);
    await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
    await invitedPage.getByTestId('first-access-username').fill(invitedUser.username);
    await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
    await invitedPage.getByLabel('Position').click();
    await invitedPage.getByRole('option', { name: 'Striker' }).click();
    await invitedPage.getByTestId('first-access-submit').click();
    
    // Accept invitation using utility
    await acceptPendingInvitation(invitedPage, orgName);

    // 2. Create Pelada and Setup Teams
    await page.goto('/');
    await page.getByTestId(`org-link-${orgName}`).click();
    
    // Create two teams manually to ensure they exist
    await page.getByTestId('create-team-open-dialog').click();
    await page.getByTestId('team-name-input').fill('Team 1');
    await page.getByTestId('team-submit-button').click();
    
    await page.getByTestId('create-team-open-dialog').click();
    await page.getByTestId('team-name-input').fill('Team 2');
    await page.getByTestId('team-submit-button').click();

    // Enable fixed goalkeepers in form
    await page.getByLabel(/Goleiros Fixos|Fixed Goalkeepers/i).check();
    await page.getByTestId('create-pelada-submit').click();
    
    // Both confirm attendance
    await page.getByTestId('attendance-confirm-button').click();
    const peladaUrl = page.url();
    await invitedPage.goto(peladaUrl);
    await invitedPage.getByTestId('attendance-confirm-button').click();

    await page.reload();
    await page.getByTestId('close-attendance-button').click();
    
    // Randomize
    await page.getByTestId('randomize-teams-button').click();
    await page.waitForTimeout(1000);

    await page.getByTestId('start-pelada-button').click();
    await page.getByTestId('confirm-start-pelada-button').click();

    // 3. Record Match Events
    await expect(page).toHaveURL(/\/peladas\/\d+\/matches/);
    
    // Record 2 goals for the other team (away) so admin (GK) takes 2 goals
    await page.getByTestId('score-away-plus').click();
    await page.getByTestId('score-away-plus').click();
    
    // Record 1 goal for invited player
    const playerRow = page.locator('tr').filter({ hasText: invitedUser.name });
    await playerRow.getByTestId('stat-goals-plus').click();

    // End match
    await page.getByTestId('end-match-button').click();
    await expect(page.getByTestId('match-status-text')).toBeVisible();

    // 4. Verify Summary
    await page.getByTestId('share-summary-button').click();
    // Verify "Gols sofridos" is NOT in the detailed table
    await expect(page.getByText(/Gols sofridos|Goals conceded/i)).toHaveCount(0);

    // 5. Close Pelada
    await page.getByTestId('close-pelada-button').click();
    await expect(page.getByText(/Pelada closed|Pelada encerrada/i)).toBeVisible();

    // 6. Verify Admin can still EDIT after closed
    await page.getByTestId('edit-match-button').click();
    await expect(page.getByTestId('finish-editing-button')).toBeVisible();
    
    // Add another goal while closed
    await page.getByTestId('score-home-plus').click();
    await page.getByTestId('finish-editing-button').click();
    // Initially was 1x2. Adding 1 home goal makes it 2x2.
    await expect(page.getByText('2 x 2')).toBeVisible();

    // 7. Verify Voting Page shows stats
    const peladaId = page.url().split('/').find((s, i, a) => a[i-1] === 'peladas');
    await page.goto(`/peladas/${peladaId}/voting`);
    
    // Admin voting for invited player
    await expect(page.getByText(invitedUser.name)).toBeVisible();
    // The player stats should show 1 goal
    await expect(page.getByText(/Gols: 1/i)).toBeVisible();
    await expect(page.getByText(/Assis.: 0/i)).toBeVisible();

    await invitedContext.close();
    await saveVideo(page, 'new-features-test', testInfo);
  });
});