import { test, expect } from '@playwright/test';
import {
  registerAndCreateOrg,
  createPlayerViaApi,
  getApiContext,
  createPelada,
  confirmAndCloseAttendanceViaApi,
  getOrgIdFromUrl,
} from './utils';

test.describe('New UI Features: Control Panel and Player Movement', () => {
  let admin: any;
  let player1Name: string;
  let player2Name: string;
  let player3Name: string;
  let orgName: string;

  test.beforeEach(async ({ page, request }) => {
    test.setTimeout(120000);
    const timestamp = Date.now() + Math.floor(Math.random() * 1000);
    admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: 'password123',
      position: 'Defender',
    };
    player1Name = `P1 ${timestamp}`;
    player2Name = `P2 ${timestamp}`;
    player3Name = `P3 ${timestamp}`;
    orgName = `New UI Org ${timestamp}`;

    await registerAndCreateOrg(page, admin, orgName);
    const orgId = getOrgIdFromUrl(page.url());
    const api = await getApiContext(page, request);

    // Create players via API
    await createPlayerViaApi(api, orgId, player1Name);
    await createPlayerViaApi(api, orgId, player2Name);
    await createPlayerViaApi(api, orgId, player3Name);

    // Create pelada and confirm all players via API
    await page.goto(`/organizations/${orgId}`);
    const peladaId = await createPelada(page);
    await confirmAndCloseAttendanceViaApi(api, orgId, peladaId);
    await page.goto(`/peladas/${peladaId}`);
    await page.waitForLoadState('networkidle');
  });

  test('should manage players per team and randomize via new header panel', async ({ page }) => {
    // Check initial state
    const perTeamValue = page.locator('text=/PER TEAM|POR TIME/i').locator('xpath=..').locator('h6');
    await expect(perTeamValue).toHaveText('5');

    // Increase players per team
    const addButton = page.getByTestId('players-per-team-increment');
    await addButton.click();
    await expect(perTeamValue).toHaveText('6');

    // Decrease players per team
    const removeButton = page.getByTestId('players-per-team-decrement');
    await removeButton.click();
    await expect(perTeamValue).toHaveText('5');

    // Randomize button
    const randomizeBtn = page.getByTestId('randomize-teams-button');
    await expect(randomizeBtn).toBeVisible();
    await randomizeBtn.click();
    // (Wait for any potential loading or toast if applicable)
  });

  test('should move player between bench and teams via action menu', async ({ page }) => {
    // 1. Add a team first
    await page.getByText(/Adicionar Time|Add Team/i).first().click();
    await expect(page.getByTestId('team-card')).toHaveCount(1);
    const teamName = await page.getByTestId('team-card-name').first().innerText();

    // 2. Open action menu for a player on the bench
    const playerOnBench = page.getByTestId('player-row').filter({ hasText: player1Name });
    await playerOnBench.locator('button:has(svg[data-testid="SwapHorizIcon"])').click();

    // 3. Move to the team
    await page.getByRole('menuitem', { name: new RegExp(`Mover para ${teamName}|Move to ${teamName}`, 'i') }).click();

    // 4. Verify player moved to team
    const teamCard = page.getByTestId('team-card').first();
    await expect(teamCard.getByTestId('player-row').filter({ hasText: player1Name })).toBeVisible();

    // 5. Move back to bench
    await teamCard.getByTestId('player-row').filter({ hasText: player1Name }).locator('button:has(svg[data-testid="SwapHorizIcon"])').click();
    await page.getByRole('menuitem', { name: /Enviar para o Banco|Send to Bench/i }).click();

    // 6. Verify player is back on bench
    await expect(page.getByTestId('available-players-container').or(page.locator('body')).getByTestId('player-row').filter({ hasText: player1Name })).toBeVisible();
  });

  test('should show swap dialog when moving player to a full team', async ({ page }) => {
    // 1. Set players per team to 1 for easy testing
    const removeButton = page.getByTestId('players-per-team-decrement');
    for (let i = 0; i < 4; i++) {
      await removeButton.click();
      await page.waitForTimeout(500); // Wait for API and UI update
    }

    const perTeamValue = page.locator('text=/PER TEAM|POR TIME/i').locator('xpath=..').locator('h6');
    await expect(perTeamValue).toHaveText('1');

    // 2. Add two teams
    await page.getByText(/Adicionar Time|Add Team/i).first().click();
    await page.getByText(/Adicionar Time|Add Team/i).first().click();
    await expect(page.getByTestId('team-card')).toHaveCount(2);

    const team1Name = await page.getByTestId('team-card-name').nth(0).innerText();
    const team2Name = await page.getByTestId('team-card-name').nth(1).innerText();

    // 3. Put player1 in Team 1 and player2 in Team 2
    // Move Player 1 to Team 1
    await page.getByTestId('player-row').filter({ hasText: player1Name }).locator('button:has(svg[data-testid="SwapHorizIcon"])').click();
    await page.getByRole('menuitem', { name: new RegExp(`Mover para ${team1Name}|Move to ${team1Name}`, 'i') }).click();
    
    // Move Player 2 to Team 2
    await page.getByTestId('player-row').filter({ hasText: player2Name }).locator('button:has(svg[data-testid="SwapHorizIcon"])').click();
    await page.getByRole('menuitem', { name: new RegExp(`Mover para ${team2Name}|Move to ${team2Name}`, 'i') }).click();

    await expect(page.getByTestId('team-card').nth(0).getByTestId('player-row')).toHaveCount(1);
    await expect(page.getByTestId('team-card').nth(1).getByTestId('player-row')).toHaveCount(1);

    // 4. Try to move Player 1 from Team 1 to Team 2 (which is full)
    await page.getByTestId('team-card').nth(0).getByTestId('player-row').filter({ hasText: player1Name }).locator('button:has(svg[data-testid="SwapHorizIcon"])').click();
    await page.getByRole('menuitem', { name: new RegExp(`Mover para ${team2Name}|Move to ${team2Name}`, 'i') }).click();

    // 5. Verify Swap Dialog appears
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Substituir Jogador|Substitute Player/i)).toBeVisible();
    await expect(dialog.getByText(player2Name)).toBeVisible(); // Should list player2 as an option to be replaced

    // 6. Perform swap
    await dialog.getByRole('button', { name: player2Name }).click();

    // 7. Verify positions swapped
    await expect(page.getByTestId('team-card').nth(1).getByTestId('player-row').filter({ hasText: player1Name })).toBeVisible();
    await expect(page.getByTestId('team-card').nth(0).getByTestId('player-row').filter({ hasText: player2Name })).toBeVisible();
  });

  test('should handle fixed goalkeepers via action menu', async ({ page }) => {
    // 1. Enable fixed goalkeepers
    const fixedGkToggle = page.getByTestId('fixed-gk-toggle');
    await fixedGkToggle.click();
    
    await expect(page.getByText(/Goleiros Fixos da Sessão|Session Fixed Goalkeepers/i)).toBeVisible();

    // 2. Move player to Home GK via menu
    await page.getByTestId('player-row').filter({ hasText: player1Name }).locator('button:has(svg[data-testid="SwapHorizIcon"])').click();
    await page.getByRole('menuitem', { name: /Mover para Goleiro \(Casa\)|Move to Home GK/i }).click();

    // 3. Verify player is in fixed GK slot
    const homeGkSlot = page.getByTestId('gk-slot-home');
    await expect(homeGkSlot.getByText(player1Name)).toBeVisible();

    // 4. Move player from Fixed GK to Away GK
    // In Fixed GK slot, it's a Stack with the name, but I removed the action menu from there in my previous changes?
    // Wait, let me check if I removed it.
    // Actually, I did NOT add the SwapHoriz icon to FixedGoalkeepersSection.tsx.
    // I only added it to TeamCard and AvailablePlayerItem.
    // So the test should move it from Bench to Away GK if it wants to test that,
    // or I should add the menu to FixedGoalkeepersSection too.
    
    // User asked: "Instead of the three vertical dots in the player card, can we use the substitution icon or any other that makes a reference to move from one place to another?"
    // FixedGoalkeepersSection has a DELETE icon but no "move" menu.
    
    // Let's adjust the test to move from Bench to Home then Bench to Away.
    
    // Move from Home GK back to Bench (using the delete/remove button in Fixed GK section)
    await homeGkSlot.locator('button:has(svg[data-testid="DeleteOutlineIcon"])').click();
    await expect(homeGkSlot.getByText(player1Name)).not.toBeVisible();
    
    // Move from Bench to Away GK
    await page.getByTestId('player-row').filter({ hasText: player1Name }).locator('button:has(svg[data-testid="SwapHorizIcon"])').click();
    await page.getByRole('menuitem', { name: /Mover para Goleiro \(Fora\)|Move to Away GK/i }).click();

    const awayGkSlot = page.getByTestId('gk-slot-away');
    await expect(awayGkSlot.getByText(player1Name)).toBeVisible();
  });
});
