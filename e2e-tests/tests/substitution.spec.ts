import { test, expect } from '@playwright/test';
import {
  registerAndCreateOrg,
  getApiContext,
  createPlayerViaApi,
  createPelada,
  confirmAndCloseAttendanceViaApi,
  setupTeams,
  buildAndUseSchedule,
  startPelada,
  getOrgIdFromUrl,
  getPeladaIdFromUrl,
} from './utils';

test.describe('Substitution and Empty Spots', () => {
  const timestamp = Date.now();
  const admin = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const player1Name = `Player1 ${timestamp}`;
  const player2Name = `Player2 ${timestamp}`;
  const orgName = `Sub Org ${timestamp}`;

  test('should show empty spots and allow substitution from bench', async ({ page, request }) => {
    test.setTimeout(120000);

    await registerAndCreateOrg(page, admin, orgName);
    const orgId = getOrgIdFromUrl(page.url());
    const api = await getApiContext(page, request);

    // Create players via API
    await createPlayerViaApi(api, orgId, player1Name);
    await createPlayerViaApi(api, orgId, player2Name);

    // Create pelada and confirm all players via API
    await page.goto(`/organizations/${orgId}`);
    const peladaId = await createPelada(page);
    await confirmAndCloseAttendanceViaApi(api, orgId, peladaId);

    // Setup teams
    await page.goto(`/peladas/${peladaId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Times|Teams/i).first()).toBeVisible({ timeout: 15000 });
    await setupTeams(page, { count: 2, playersPerTeam: 2 });

    // Add only admin to Team 1 via API
    const playersRes = await api.request.get(`${api.apiBaseUrl}/api/organizations/${orgId}/players`, {
      headers: { Authorization: `Token ${api.token}` },
    });
    const players = await playersRes.json();
    const adminObj = players.find((p: any) => p.user_name === admin.name);

    const teamsRes = await api.request.get(`${api.apiBaseUrl}/api/peladas/${peladaId}/dashboard-data`, {
      headers: { Authorization: `Token ${api.token}` },
    });
    const dashboardData = await teamsRes.json();
    const team1Id = dashboardData.teams[0].id;

    await api.request.post(`${api.apiBaseUrl}/api/teams/${team1Id}/players`, {
      data: { player_id: adminObj.id },
      headers: { Authorization: `Token ${api.token}` },
    });

    await page.reload();

    // Build schedule and start
    await buildAndUseSchedule(page);
    await startPelada(page);

    // Verify and perform substitution
    const homeTeamSection = page.getByTestId('home-team-match-section');
    const emptySlot = homeTeamSection.getByTestId('player-row-empty').first();
    await expect(emptySlot).toBeVisible({ timeout: 15000 });

    await emptySlot.getByRole('button').click();
    await expect(page.getByTestId('player-select-dialog')).toBeVisible();
    await page.getByTestId('player-select-dialog').getByText(player1Name).click();

    await expect(homeTeamSection.getByTestId('player-row').filter({ hasText: player1Name })).toBeVisible();
    await expect(homeTeamSection.getByTestId('player-row-empty')).toHaveCount(0);
  });
});
