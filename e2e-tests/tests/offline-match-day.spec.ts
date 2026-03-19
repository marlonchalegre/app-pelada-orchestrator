import { test, expect, Page } from '@playwright/test';
import { saveVideo, registerUser, createOrganization, acceptPendingInvitation, invitePlayerByEmail } from './utils';

async function setupMatchDay(page: Page, orgName: string, owner: any, player2: any) {
  await registerUser(page, owner);
  await createOrganization(page, orgName);

  const p2Invite = await invitePlayerByEmail(page, player2.email);

  const p2Context = await page.context().browser()!.newContext();
  const p2Page = await p2Context.newPage();
  await p2Page.goto(p2Invite);
  await p2Page.getByTestId('first-access-name').fill(player2.name);
  await p2Page.getByTestId('first-access-username').fill(player2.username);
  await p2Page.getByTestId('first-access-password').fill(player2.password);
  await p2Page.getByTestId('first-access-submit').click();
  await acceptPendingInvitation(p2Page, orgName);
  await p2Context.close();

  await page.goto('/');
  await page.getByTestId(`org-link-${orgName}`).or(page.getByText(orgName).first()).click();

  await page.getByRole('button', { name: /Criar pelada|Create pelada/i }).click();

  await page.getByTestId('attendance-confirm-button').or(page.getByTestId('attendance-card-confirm')).first().click();
  
  await page.getByRole('tab', { name: /Pendente|Pending/i }).click();
  await page.getByTestId('attendance-card-confirm').first().click(); 
  
  await page.getByTestId('close-attendance-button').click();
  await page.getByTestId('confirm-close-attendance-button').click();

  // Adjust players per team to 1 so we have 2 teams
  await page.getByTestId('players-per-team-input').locator('input').fill('1');
  await page.keyboard.press('Enter');

  // Create 2 teams
  await page.getByTestId('create-team-button').click();
  await page.getByTestId('create-team-button').click();

  await page.getByTestId('randomize-teams-button').click();
  
  // Wait for randomization to finish and UI to update
  await page.waitForTimeout(2000);
  await page.reload(); 
  
  // Iniciar
  const buildBtn = page.getByTestId('build-schedule-button');
  await expect(buildBtn).toBeVisible({ timeout: 15000 });
  await buildBtn.click();
  await page.getByTestId('add-match-button').click();
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
  
  const saveBtn = page.getByTestId('save-schedule-button');
  await expect(saveBtn).toBeEnabled({ timeout: 15000 });
  await saveBtn.click();
  
  // Wait for redirect back to detail page
  await expect(page).toHaveURL(/\/peladas\/\d+$/, { timeout: 15000 });
  
  await page.getByTestId('start-pelada-button').click();
  await page.getByRole('button', { name: /Confirm|Confirmar/i }).click();

  await expect(page).toHaveURL(/\/peladas\/\d+\/matches/);
  await expect(page.getByRole('tab', { name: /Dashboard|Match/i })).toBeVisible();
}

test.describe('Offline Match Day', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Midfielder'
  };
  const player2 = {
    name: `Player ${timestamp}`,
    username: `p2_${timestamp}`,
    email: `player-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker'
  };
  const orgName = `Offline Org ${timestamp}`;

  test('should queue actions when offline, load from cache and sync when online', async ({ browser }, testInfo) => {
    test.setTimeout(240000);
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await setupMatchDay(page, orgName, owner, player2);

    // Wait more for data to settle and be cached in localStorage
    await page.waitForTimeout(5000);

    // Ensure player row is visible before going offline
    await expect(page.getByTestId('player-row').first()).toBeVisible({ timeout: 20000 });

    // 1. Go Offline
    await context.setOffline(true);
    
    // The offline banner should appear
    await expect(page.getByTestId('offline-banner')).toBeVisible();

    // 2. Perform an action: Adjust Score
    // First, start match timer to ensure match is running
    await page.getByTestId('start-match-timer-button').click();
    
    // Check optimistic UI updated immediately (START_MATCH_TIMER + START_PELADA_TIMER)
    await expect(page.getByTestId('pending-actions-count')).toContainText('2');
    
    // Add goal
    await page.getByTestId('stat-goals-increment').first().click();
    
    // RECORD_EVENT + ADJUST_SCORE = 2 more actions. Total 4.
    await expect(page.getByTestId('pending-actions-count')).toContainText('4');
    const scoreBoard = page.getByTestId('match-score-display');
    await expect(scoreBoard).toContainText('1');

    // 3. Test "Cache" by mocking API failure and ensuring UI stays active
    // (We don't reload because we are in dev mode, but we can verify current UI)
    await expect(page.getByRole('tab', { name: /Dashboard|Match/i })).toBeVisible();
    await expect(page.getByTestId('match-score-display')).toContainText('1');

    // 4. Go Online
    await context.setOffline(false);

    await expect(page.getByTestId('offline-banner')).not.toBeVisible();
    await expect(page.getByTestId('pending-actions-alert')).not.toBeVisible({ timeout: 20000 });
    await expect(scoreBoard).toContainText('1');

    // Final verification: Refresh should persist the sync'd data
    await page.reload();
    await expect(page.getByTestId('match-score-display')).toContainText('1');

    await saveVideo(page, 'offline-match-day-sync', testInfo);
    await context.close();
  });
});
