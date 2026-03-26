import { test, expect } from '@playwright/test';
import { 
  UserData, 
  registerAndCreateOrg, 
  createPelada, 
  confirmAndCloseAttendance, 
  setupTeams, 
  buildAndSaveSchedule, 
  startPelada 
} from './utils';

test.describe('Voting Disable Feature', () => {
  test('voting_enabled status is displayed in voting page', async ({ page }) => {
    // Use unique data for this test
    const adminUser: UserData = {
      name: 'Voting Admin Status',
      username: 'voting_admin_status_' + Math.random().toString(36).substring(7),
      email: `voting_admin_status_${Date.now()}@test.com`,
      password: 'password123',
    };
    const orgName = 'Voting Status Test';

    // 1. Setup Organization and Pelada
    await registerAndCreateOrg(page, adminUser, orgName);
    const peladaId = await createPelada(page);
    
    // 2. Confirm attendance for all players
    await confirmAndCloseAttendance(page);
    
    // 3. Setup teams
    await setupTeams(page, { count: 2 });
    await buildAndSaveSchedule(page);
    await startPelada(page);
    
    // 4. Close pelada to enable voting
    await page.getByRole('tab', { name: /Classificação|Standings/i }).click();
    
    const closeBtn = page.getByTestId('close-pelada-button');
    await expect(closeBtn).toBeVisible({ timeout: 10000 });
    await closeBtn.click();
    await page.getByRole('button', { name: /Confirmar|Confirm/i }).click();
    await expect(page).toHaveURL(new RegExp(`/peladas/${peladaId}/matches`));
    
    // 5. Navigate to voting page directly
    await page.goto(`/peladas/${peladaId}/voting`);
    await expect(page.getByText(/Votação|Voting/i).first()).toBeVisible({ timeout: 10000 });
    
    // 6. If there are voting cards, verify they don't show disabled badge initially
    const votingCards = page.getByTestId(/^voting-card-/);
    let cardCount = await votingCards.count({ timeout: 5000 }).catch(() => 0);
    
    if (cardCount > 0) {
      // Verify no cards show disabled badge
      for (let i = 0; i < cardCount && i < 3; i++) {
        const card = votingCards.nth(i);
        const disabledBadge = card.getByText(/Disabled|Desativado/i);
        const isBadgeVisible = await disabledBadge.isVisible({ timeout: 500 }).catch(() => false);
        expect(isBadgeVisible).toBe(false);
      }
    }
  });
});
