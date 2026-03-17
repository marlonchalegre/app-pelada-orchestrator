import { test, expect } from '@playwright/test';
import { acceptPendingInvitation } from './utils';

test.describe('Mobile UX and Permissions', () => {
  let admin: any;
  let player: any;
  let orgName: string;

  test.beforeEach(async ({ page }) => {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: 'password123'
    };
    player = {
      name: `Player ${timestamp}`,
      username: `player_${timestamp}`,
      email: `player-${timestamp}@example.com`,
      password: 'password123'
    };
    orgName = `UX Org ${timestamp}`;

    // Register Admin
    await page.goto('/register');
    await page.getByTestId('register-name').fill(admin.name);
    await page.getByTestId('register-username').fill(admin.username);
    await page.getByTestId('register-email').fill(admin.email);
    await page.getByTestId('register-password').fill(admin.password);
    await page.getByLabel('Position').click();
    await page.getByRole('option', { name: 'Striker' }).click();
    await page.getByTestId('register-submit').click();

    // Create Org
    await page.getByTestId('create-org-open-dialog').click();
    await page.getByTestId('org-name-input').fill(orgName);
    await page.getByTestId('org-submit-button').click();
    await page.getByTestId(`org-link-${orgName}`).click();
  });

  test('should verify attendance details, restricted icons and row visibility', async ({ browser, page }) => {
    // 1. Admin makes themselves a Mensalista
    await page.getByTestId('org-management-button').click();
    const adminMemberRow = page.locator('li').filter({ hasText: admin.name });
    await adminMemberRow.getByRole('combobox').click();
    await page.getByRole('option', { name: /Mensalista/i }).click();

    // 2. Admin invites a Player (to test restricted icons later)
    await page.getByTestId('mgmt-tab-invitations').or(page.getByRole('tab', { name: /Convites/i })).click();
    await page.getByTestId('invitations-invite-button').click();
    await page.getByTestId('invite-email-input').fill(player.email);
    await page.getByTestId('send-invite-button').click();
    const inviteLink = await page.getByTestId('invitation-link-text').innerText();
    await page.getByTestId('invite-dialog-close-button').click();
    
    // 3. Setup Player
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await playerPage.goto(inviteLink);
    await playerPage.getByTestId('first-access-name').fill(player.name);
    await playerPage.getByTestId('first-access-username').fill(player.username);
    await playerPage.getByTestId('first-access-password').fill(player.password);
    await playerPage.getByTestId('first-access-submit').click();
    await acceptPendingInvitation(playerPage, orgName);

    // 4. Admin creates Pelada
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${orgName}`).click();
    await page.getByTestId('create-pelada-submit').click();
    await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/);
    const attendanceUrl = page.url();

    // 5. Verify Admin Card Details
    await page.getByTestId('attendance-confirm-button').click();
    const adminCard = page.getByTestId(`attendance-card-${admin.username}`);
    await expect(adminCard).toBeVisible();
    await expect(adminCard.getByText(/Atacante|Striker/i)).toBeVisible();
    await expect(adminCard.getByText(/Mensalista/i)).toBeVisible();

    // 6. Player joins attendance and verifies restricted icons
    await playerPage.goto(attendanceUrl);
    await playerPage.getByTestId('attendance-confirm-button').click();
    
    // Player is diarista by default, so they go to waitlist
    await playerPage.getByRole('tab', { name: /Espera|Waitlist/i }).first().click();
    
    const playerCardOnPlayerPage = playerPage.getByTestId(`attendance-card-${player.username}`);
    await expect(playerCardOnPlayerPage).toBeVisible();
    
    // Verify regular player CANNOT see admin icons in any card
    await expect(playerPage.getByTestId('attendance-card-confirm')).not.toBeVisible();
    await expect(playerPage.getByTestId('attendance-card-decline')).not.toBeVisible();

    // 7. Verify restricted buttons on Pelada Detail Page for regular user
    // First admin closes attendance
    await page.getByTestId('close-attendance-button').click();
    await page.getByTestId('confirm-close-attendance-button').click();
    await expect(page).toHaveURL(/\/peladas\/\d+$/);
    const peladaDetailUrl = page.url();

    await playerPage.goto(peladaDetailUrl);
    // Regular user should NOT see: Add players, Randomize, Create Team, Delete Team, Export
    await expect(playerPage.getByTestId('copy-players-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('randomize-teams-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('create-team-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('share-dropdown-button')).not.toBeVisible();
    
    // 8. Verify row visibility in Peladas list
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const peladaRow = page.getByTestId(/pelada-row-\d+/).first();
    await expect(peladaRow).toBeVisible();

    await playerContext.close();
  });

  test('should verify mobile optimizations (hidden text)', async ({ page }) => {
    // Set viewport to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${orgName}`).click();

    // Create Pelada
    await page.getByTestId('create-pelada-submit').click();
    await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/);

    // Check if "Fechar Lista" text is hidden (span with display: none)
    const closeBtn = page.getByTestId('close-attendance-button');
    const textSpan = closeBtn.locator('span').filter({ hasText: /Fechar Lista|Close List/i });
    await expect(textSpan).not.toBeVisible();

    // Go to Org Management
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${orgName}`).click();
    await page.getByTestId('org-management-button').click();

    // Check tabs labels are hidden
    const membersTab = page.getByTestId('mgmt-tab-members');
    const tabLabel = membersTab.locator('span').filter({ hasText: /Membros|Members/i });
    await expect(tabLabel).not.toBeVisible();
  });
});
