import { test, expect } from '@playwright/test';
import {
  registerAndCreateOrg,
  invitePlayerByEmail,
  acceptPendingInvitation,
  makeMensalista,
  createPelada,
  UserData,
} from './utils';

test.describe('Mobile UX and Permissions', () => {
  let admin: UserData;
  let player: UserData;
  let orgName: string;

  test.beforeEach(async ({ page }) => {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: 'password123',
      position: 'Striker',
    };
    player = {
      name: `Player ${timestamp}`,
      username: `player_${timestamp}`,
      email: `player-${timestamp}@example.com`,
      password: 'password123',
    };
    orgName = `UX Org ${timestamp}`;
    await registerAndCreateOrg(page, admin, orgName);
  });

  test('should verify attendance details, restricted icons and row visibility', async ({ browser, page }) => {
    // Make admin Mensalista
    await makeMensalista(page, admin.name);

    // Go back to org detail then invite player
    await page.goto('/');
    await page.getByTestId(`org-link-${orgName}`).click();
    const inviteLink = await invitePlayerByEmail(page, player.email);

    // Setup player in separate context
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await playerPage.goto(inviteLink);
    await playerPage.getByTestId('first-access-name').fill(player.name);
    await playerPage.getByTestId('first-access-username').fill(player.username);
    await playerPage.getByTestId('first-access-password').fill(player.password);
    await playerPage.getByTestId('first-access-submit').click();
    await expect(playerPage).toHaveURL('/', { timeout: 15000 });

    await acceptPendingInvitation(playerPage, orgName);

    // Create pelada
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${orgName}`).click();
    await createPelada(page);
    const attendanceUrl = page.url();

    // Admin confirms attendance
    await page.getByTestId('attendance-confirm-button').click();
    const adminCard = page.getByTestId(`attendance-card-${admin.username}`);
    await expect(adminCard).toBeVisible();
    await expect(adminCard.getByText(/Atacante|Striker/i)).toBeVisible();
    await expect(adminCard.getByText(/Mensalista/i)).toBeVisible();

    // Player joins and verifies restricted icons
    await playerPage.goto(attendanceUrl);
    await playerPage.getByTestId('attendance-confirm-button').click();
    await playerPage.getByRole('tab', { name: /Espera|Waitlist/i }).first().click();
    await expect(playerPage.getByTestId(`attendance-card-${player.username}`)).toBeVisible();
    await expect(playerPage.getByTestId('attendance-card-confirm')).not.toBeVisible();
    await expect(playerPage.getByTestId('attendance-card-decline')).not.toBeVisible();

    // Admin closes attendance
    await page.getByTestId('close-attendance-button').click();
    await page.getByTestId('confirm-close-attendance-button').click();
    await expect(page).toHaveURL(/\/peladas\/\d+$/);

    // Verify restricted buttons for regular user on pelada detail
    await playerPage.goto(page.url());
    await expect(playerPage.getByTestId('copy-players-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('randomize-teams-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('create-team-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('share-dropdown-button')).not.toBeVisible();

    // Verify pelada row visible in list
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(/pelada-row-\d+/).first()).toBeVisible();

    await playerContext.close();
  });

  test('should verify mobile optimizations (hidden text)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${orgName}`).click();

    await createPelada(page);

    // Check close button text is hidden on mobile
    const closeBtn = page.getByTestId('close-attendance-button');
    const textSpan = closeBtn.locator('span').filter({ hasText: /Fechar Lista|Close List/i });
    await expect(textSpan).not.toBeVisible();

    // Check management tab labels are hidden on mobile
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${orgName}`).click();
    await page.getByTestId('org-management-button').click();
    const tabLabel = page.getByTestId('mgmt-tab-members').locator('span').filter({ hasText: /Membros|Members/i });
    await expect(tabLabel).not.toBeVisible();
  });
});
