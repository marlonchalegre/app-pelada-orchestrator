import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import {
  saveVideo,
  registerUser,
  createOrganization,
  grantOrgCreation,
  UserData,
} from './utils';

// Helper to run PostgreSQL command inside docker container to promote user
function promoteToSuperAdmin(email: string) {
  const cmd = `docker compose -f ../docker-compose.yml exec -T postgres psql -U pelada -d peladaapp -c "UPDATE \\"e2e\\".\\"Users\\" SET is_super_admin = TRUE WHERE email = '${email}';"`;
  execSync(cmd);
}

test.describe('Super Admin Panel & Block Systems', () => {
  const timestamp = Date.now() + Math.floor(Math.random() * 10000);
  
  const superAdminUser = {
    name: `Super Admin ${timestamp}`,
    username: `superadmin_${timestamp}`,
    email: `superadmin-${timestamp}@example.com`,
    password: 'password123',
    position: 'Midfielder',
  };

  const regularUser = {
    name: `Regular User ${timestamp}`,
    username: `regular_${timestamp}`,
    email: `regular-${timestamp}@example.com`,
    password: 'password123',
    position: 'Striker',
  };

  const orgAdminUser = {
    name: `Org Admin ${timestamp}`,
    username: `orgadmin_${timestamp}`,
    email: `orgadmin-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };

  const orgName = `Test Block Org ${timestamp}`;

  test('Super Admin and Blocking Workflows', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};

    // Contexts for separate users
    const superAdminContext = await browser.newContext(videoOptions);
    const superAdminPage = await superAdminContext.newPage();

    const regularContext = await browser.newContext(videoOptions);
    const regularPage = await regularContext.newPage();

    const orgAdminContext = await browser.newContext(videoOptions);
    const orgAdminPage = await orgAdminContext.newPage();

    // 1. Regular User registration and attempt to access /admin
    await test.step('1. Regular user cannot access admin panel', async () => {
      await registerUser(regularPage, regularUser);
      
      // Attempt to access admin page
      await regularPage.goto('/admin');
      // Should redirect back to /home
      await expect(regularPage).toHaveURL('/home');

      // Dropdown menu should not contain Admin Panel
      await regularPage.getByTestId('user-settings-button').click();
      await expect(regularPage.getByTestId('admin-menu-item')).toBeHidden();
      // Close dropdown
      await regularPage.keyboard.press('Escape');
    });

    // 2. Promote superAdminUser, verify access to /admin
    await test.step('2. Promote user to Super Admin and access panel', async () => {
      await registerUser(superAdminPage, superAdminUser);

      // Promote to super admin via DB
      promoteToSuperAdmin(superAdminUser.email);

      // Log out and log back in to get a new token/cookie with the updated claim
      await superAdminPage.getByTestId('user-settings-button').click();
      await superAdminPage.getByTestId('logout-menu-item').click();
      await expect(superAdminPage).toHaveURL('/');

      // Log back in
      await superAdminPage.goto('/login');
      await superAdminPage.getByTestId('login-email').fill(superAdminUser.username);
      await superAdminPage.getByTestId('login-password').fill(superAdminUser.password);
      await superAdminPage.getByTestId('login-submit').click();
      await expect(superAdminPage).toHaveURL('/home');

      // Click avatar menu and click admin panel
      await superAdminPage.getByTestId('user-settings-button').click();
      const adminMenu = superAdminPage.getByTestId('admin-menu-item');
      await expect(adminMenu).toBeVisible();
      await adminMenu.click();

      await expect(superAdminPage).toHaveURL('/admin');
      await expect(superAdminPage.locator('h1')).toContainText(/Painel do Super Admin|Super Admin Panel/i);
    });

    // 3. Toggle allow_org_creation for regularUser
    await test.step('3. Toggle organization creation permission', async () => {
      await superAdminPage.goto('/admin');
      
      // Search for regular user
      const userSearchInput = superAdminPage.getByPlaceholder(/Buscar por nome|Search by name/i);
      await userSearchInput.click();
      await userSearchInput.pressSequentially(regularUser.name);
      const userResponsePromise = superAdminPage.waitForResponse(resp => resp.url().includes('/api/users/search') && resp.status() === 200);
      await userSearchInput.press('Enter');
      await userResponsePromise;

      const userRow = superAdminPage.locator('tr').filter({ hasText: regularUser.name });
      await expect(userRow).toBeVisible();

      // Checkboxes: is_blocked (nth 0), allow_org_creation (nth 1), is_super_admin (nth 2)
      const orgCreationSwitch = userRow.locator('input[type="checkbox"]').nth(1);
      // Default is false — switch starts unchecked
      await expect(orgCreationSwitch).not.toBeChecked();

      // Check it (grant permission)
      const grantTogglePromise = superAdminPage.waitForResponse(resp => resp.url().includes('/toggle-org-creation') && resp.status() === 200);
      await orgCreationSwitch.click();
      await grantTogglePromise;
      await expect(orgCreationSwitch).toBeChecked();

      // Uncheck it again (revoke permission)
      const revokeTogglePromise = superAdminPage.waitForResponse(resp => resp.url().includes('/toggle-org-creation') && resp.status() === 200);
      await orgCreationSwitch.click();
      await revokeTogglePromise;
      await expect(orgCreationSwitch).not.toBeChecked();

      // Verify on regular user's page that the create org dialog shows a warning (no form)
      await regularPage.reload();
      await regularPage.waitForLoadState('networkidle');
      // The button should still be clickable but the form inside shows a warning
      await regularPage.getByTestId('create-org-open-dialog').click();
      await expect(regularPage.getByRole('dialog')).toBeVisible();
      // The warning alert should be visible, not the form inputs
      await expect(regularPage.getByTestId('org-name-input')).not.toBeVisible();
      await regularPage.keyboard.press('Escape');
    });

    // 4. Block regularUser and verify limitations
    await test.step('4. Block user and verify restrictions', async () => {
      await superAdminPage.goto('/admin');

      // Search for regular user
      const userSearchInput2 = superAdminPage.getByPlaceholder(/Buscar por nome|Search by name/i);
      await userSearchInput2.click();
      await userSearchInput2.pressSequentially(regularUser.name);
      const userResponsePromise2 = superAdminPage.waitForResponse(resp => resp.url().includes('/api/users/search') && resp.status() === 200);
      await userSearchInput2.press('Enter');
      await userResponsePromise2;

      const userRow = superAdminPage.locator('tr').filter({ hasText: regularUser.name });
      const blockSwitch = userRow.locator('input[type="checkbox"]').nth(0);
      
      // Block regular user
      await blockSwitch.click();
      await expect(blockSwitch).toBeChecked();

      // Verify regular user is now restricted
      await regularPage.reload();
      await regularPage.waitForLoadState('networkidle');

      // Check warning banner is shown
      await expect(regularPage.getByText(/Sua conta está bloqueada|Your account is blocked/i)).toBeVisible();
      
      // List contents should be hidden
      await expect(regularPage.getByTestId('peladas-list')).toBeHidden();
      await expect(regularPage.getByTestId('create-org-open-dialog')).toBeHidden();

      // Blocked users should still be able to view their profile page
      await regularPage.getByTestId('user-settings-button').click();
      await regularPage.getByTestId('profile-menu-item').click();
      await expect(regularPage).toHaveURL('/profile');
    });

    // 5. Block organization and verify pelada creation block
    await test.step('5. Block organization and check restrictions', async () => {
      // 5.1 Register orgAdmin and create organization
      await registerUser(orgAdminPage, orgAdminUser);
      // Grant org creation permission (default is false)
      grantOrgCreation(orgAdminUser.email);
      await createOrganization(orgAdminPage, orgName);
      const orgUrl = orgAdminPage.url();

      // 5.2 Block the organization in admin panel
      await superAdminPage.goto('/admin');
      await superAdminPage.getByRole('tab', { name: /Organizações|Organizations/i }).click();

      // Search for the organization
      const orgSearchInput = superAdminPage.getByPlaceholder(/Buscar organização|Search organization/i);
      await orgSearchInput.click();
      await orgSearchInput.pressSequentially(orgName);
      const orgResponsePromise = superAdminPage.waitForResponse(resp => resp.url().includes('/api/admin/organizations') && resp.status() === 200);
      await orgSearchInput.press('Enter');
      await orgResponsePromise;

      const orgRow = superAdminPage.locator('tr').filter({ hasText: orgName });
      await expect(orgRow).toBeVisible();

      const blockOrgSwitch = orgRow.locator('input[type="checkbox"]').first();
      await expect(blockOrgSwitch).not.toBeChecked();

      // Block it
      await blockOrgSwitch.click();
      await expect(blockOrgSwitch).toBeChecked();

      // 5.3 Verify on orgAdminPage that the org is blocked
      await orgAdminPage.goto(orgUrl);
      await orgAdminPage.waitForLoadState('networkidle');

      // Org blocked banner should be visible
      await expect(orgAdminPage.getByTestId('org-blocked-banner')).toBeVisible();

      // The create pelada form/section should be hidden
      await expect(orgAdminPage.getByTestId('create-pelada-submit')).toBeHidden();
    });

    // Cleanup contexts
    await superAdminContext.close();
    await regularContext.close();
    await orgAdminContext.close();

    await saveVideo(superAdminPage, 'superadmin-flow', testInfo);
    await saveVideo(regularPage, 'blocked-user-flow', testInfo);
    await saveVideo(orgAdminPage, 'blocked-org-flow', testInfo);
  });
});
