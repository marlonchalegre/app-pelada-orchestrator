import { test, expect } from '@playwright/test';

test.describe('Substitution and Empty Spots', () => {
  const timestamp = Date.now();
  const admin = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: 'password123'
  };
  const player1Name = `Player1 ${timestamp}`;
  const player2Name = `Player2 ${timestamp}`;
  const orgName = `Sub Org ${timestamp}`;

  test('should show empty spots and allow substitution from bench', async ({ page, request }) => {
    test.setTimeout(120000);

    // 1. Register Admin
    await page.goto('/register');
    await page.getByTestId('register-name').fill(admin.name);
    await page.getByTestId('register-username').fill(admin.username);
    await page.getByTestId('register-email').fill(admin.email);
    await page.getByTestId('register-password').fill(admin.password);
    await page.getByTestId('register-submit').click();

    // 2. Create Org
    await page.getByTestId('create-org-open-dialog').click();
    await page.getByTestId('org-name-input').fill(orgName);
    await page.getByTestId('org-submit-button').click();
    await page.getByTestId(`org-link-${orgName}`).click();
    
    const orgId = page.url().split('/').pop();
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8000';

    // 3. Setup Players via API (Faster and more reliable)
    // Create 2 "guest" players directly in the org
    const setupPlayer = async (name: string) => {
        // Invite player by name only (creates a guest/partial user)
        const res = await request.post(`${apiBaseUrl}/api/organizations/${orgId}/invite`, {
            data: { name },
            headers: { 'Authorization': `Token ${token}` }
        });
        const data = await res.json();
        const userId = data.user_id;

        // Directly add them to the org
        await request.post(`${apiBaseUrl}/api/players`, {
            data: { organization_id: Number(orgId), user_id: userId, grade: 5 },
            headers: { 'Authorization': `Token ${token}` }
        });
    };

    await setupPlayer(player1Name);
    await setupPlayer(player2Name);

    // 4. Create Pelada
    await page.goto(`/organizations/${orgId}`);
    await page.getByTestId('create-pelada-submit').click();
    await expect(page).toHaveURL(/\/peladas\/\d+/);
    const peladaId = page.url().split('/').find((s, i, a) => a[i-1] === 'peladas')!;

    // Confirm all 3 players via API to skip attendance UI
    const playersRes = await request.get(`${apiBaseUrl}/api/organizations/${orgId}/players`, {
        headers: { 'Authorization': `Token ${token}` }
    });
    const players = await playersRes.json();
    
    await request.post(`${apiBaseUrl}/api/peladas/${peladaId}/attendance/batch`, {
        data: { player_ids: players.map((p: any) => p.id), status: 'confirmed' },
        headers: { 'Authorization': `Token ${token}` }
    });

    // Close attendance via API
    const closeRes = await request.put(`${apiBaseUrl}/api/peladas/${peladaId}`, {
        data: { status: 'open' },
        headers: { 'Authorization': `Token ${token}` }
    });
    if (!closeRes.ok()) {
        console.error('Failed to close attendance:', await closeRes.text());
    }
    expect(closeRes.ok()).toBeTruthy();

    // 5. Setup Teams
    await page.goto(`/peladas/${peladaId}`);
    await page.waitForLoadState('networkidle');
    
    // Verify we are on the right page and see the Teams section
    await expect(page.getByText(/Times|Teams/i).first()).toBeVisible({ timeout: 15000 });

    await page.getByTestId('create-team-button').click();
    await page.waitForTimeout(500);
    await page.getByTestId('create-team-button').click();
    await page.waitForTimeout(500);

    const limitInput = page.getByTestId('players-per-team-input').locator('input');
    await limitInput.click();
    await limitInput.fill('2');
    await page.keyboard.press('Enter');

    // Add only Admin to Team 1 via API to be fast
    const adminObj = players.find((p: any) => p.user_name === admin.name);
    const teamsRes = await request.get(`${apiBaseUrl}/api/peladas/${peladaId}/dashboard-data`, {
        headers: { 'Authorization': `Token ${token}` }
    });
    const dashboardData = await teamsRes.json();
    const team1Id = dashboardData.teams[0].id;

    await request.post(`${apiBaseUrl}/api/teams/${team1Id}/players`, {
        data: { player_id: adminObj.id },
        headers: { 'Authorization': `Token ${token}` }
    });

    await page.reload();

    // Start Pelada
    await page.getByTestId('build-schedule-button').click();
    await page.getByTestId('add-match-button').click();
    await page.getByTestId('save-schedule-button').click();
    await page.getByTestId('start-pelada-button').click();
    await page.getByRole('button', { name: /Confirmar|Confirm/i }).click();

    // 6. Verify and Perform Substitution
    await expect(page).toHaveURL(/\/matches/);
    
    // Find Team sections using data-testids.
    const homeTeamSection = page.getByTestId('home-team-match-section');
    const awayTeamSection = page.getByTestId('away-team-match-section');
    
    // Should have 1 empty spot in home team (1 player out of 2)
    const emptySlot = homeTeamSection.getByTestId('player-row-empty').first();
    await expect(emptySlot).toBeVisible({ timeout: 15000 });

    await emptySlot.getByRole('button').click();
    await expect(page.getByTestId('player-select-dialog')).toBeVisible();
    
    // Select Player 1 from bench
    await page.getByTestId('player-select-dialog').getByText(player1Name).click();

    // Verify Player 1 is now in the lineup
    await expect(homeTeamSection.getByTestId('player-row').filter({ hasText: player1Name })).toBeVisible();
    
    // Team 1 should now have 0 empty slots
    await expect(homeTeamSection.getByTestId('player-row-empty')).toHaveCount(0);
  });
});
