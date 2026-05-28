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
function promoteToGlobalAdmin(email: string) {
  const cmd = `docker compose -f ../docker-compose.yml exec -T postgres psql -U pelada -d peladaapp -c "UPDATE \\"e2e\\".\\"Users\\" SET is_super_admin = TRUE WHERE email = '${email}';"`;
  execSync(cmd);
}

test.describe('Global Admin Panel & Block Systems', () => {
  const timestamp = Date.now() + Math.floor(Math.random() * 10000);
  
  const globalAdminUser = {
    name: `Global Admin ${timestamp}`,
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

  test('Global Admin and Blocking Workflows', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};

    // Contexts for separate users
    const globalAdminContext = await browser.newContext(videoOptions);
    const globalAdminPage = await globalAdminContext.newPage();

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

    // 2. Promote globalAdminUser, verify access to /admin
    await test.step('2. Promote user to Global Admin and access panel', async () => {
      await registerUser(globalAdminPage, globalAdminUser);

      // Promote to super admin via DB
      promoteToGlobalAdmin(globalAdminUser.email);

      // Log out and log back in to get a new token/cookie with the updated claim
      await globalAdminPage.getByTestId('user-settings-button').click();
      await globalAdminPage.getByTestId('logout-menu-item').click();
      await expect(globalAdminPage).toHaveURL('/');

      // Log back in
      await globalAdminPage.goto('/login');
      await globalAdminPage.getByTestId('login-email').fill(globalAdminUser.username);
      await globalAdminPage.getByTestId('login-password').fill(globalAdminUser.password);
      await globalAdminPage.getByTestId('login-submit').click();
      await expect(globalAdminPage).toHaveURL('/home');

      // Click avatar menu and click admin panel
      await globalAdminPage.getByTestId('user-settings-button').click();
      const adminMenu = globalAdminPage.getByTestId('admin-menu-item');
      await expect(adminMenu).toBeVisible();
      await adminMenu.click();

      await expect(globalAdminPage).toHaveURL('/admin');
      await expect(globalAdminPage.locator('h1')).toContainText(/Painel do Global Admin|Global Admin Panel/i);
    });

    // 3. Toggle allow_org_creation for regularUser
    await test.step('3. Toggle organization creation permission', async () => {
      await globalAdminPage.goto('/admin');
      
      // Search for regular user
      const userSearchInput = globalAdminPage.getByPlaceholder(/Buscar por nome|Search by name/i);
      await userSearchInput.click();
      await userSearchInput.pressSequentially(regularUser.name);
      const userResponsePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/users/search') && resp.status() === 200);
      await userSearchInput.press('Enter');
      await userResponsePromise;

      const userRow = globalAdminPage.locator('tr').filter({ hasText: regularUser.name });
      await expect(userRow).toBeVisible();

      // Checkboxes: is_blocked (nth 0), allow_org_creation (nth 1), is_super_admin (nth 2)
      const orgCreationSwitch = userRow.locator('input[type="checkbox"]').nth(1);
      // Default is false — switch starts unchecked
      await expect(orgCreationSwitch).not.toBeChecked();

      // Check it (grant permission)
      const grantTogglePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/toggle-org-creation') && resp.status() === 200);
      await orgCreationSwitch.click();
      await grantTogglePromise;
      await expect(orgCreationSwitch).toBeChecked();

      // Uncheck it again (revoke permission)
      const revokeTogglePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/toggle-org-creation') && resp.status() === 200);
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
      await globalAdminPage.goto('/admin');

      // Search for regular user
      const userSearchInput2 = globalAdminPage.getByPlaceholder(/Buscar por nome|Search by name/i);
      await userSearchInput2.click();
      await userSearchInput2.pressSequentially(regularUser.name);
      const userResponsePromise2 = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/users/search') && resp.status() === 200);
      await userSearchInput2.press('Enter');
      await userResponsePromise2;

      const userRow = globalAdminPage.locator('tr').filter({ hasText: regularUser.name });
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
      await globalAdminPage.goto('/admin');
      await globalAdminPage.getByRole('tab', { name: /Organizações|Organizations/i }).click();

      // Search for the organization
      const orgSearchInput = globalAdminPage.getByPlaceholder(/Buscar organização|Search organization/i);
      await orgSearchInput.click();
      await orgSearchInput.pressSequentially(orgName);
      const orgResponsePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/admin/organizations') && resp.status() === 200);
      await orgSearchInput.press('Enter');
      await orgResponsePromise;

      const orgRow = globalAdminPage.locator('tr').filter({ hasText: orgName });
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

    // 6. Reset user password
    await test.step('6. Reset user password and verify login', async () => {
      await globalAdminPage.goto('/admin');
      
      // Search for regular user
      const userSearchInput = globalAdminPage.getByPlaceholder(/Buscar por nome|Search by name/i);
      await userSearchInput.click();
      await userSearchInput.clear();
      await userSearchInput.pressSequentially(regularUser.name);
      const userResponsePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/users/search') && resp.status() === 200);
      await userSearchInput.press('Enter');
      await userResponsePromise;

      const userRow = globalAdminPage.locator('tr').filter({ hasText: regularUser.name });
      
      // Unblock them first so we can verify they can log in
      const blockSwitch = userRow.locator('input[type="checkbox"]').nth(0);
      await blockSwitch.click();
      await expect(blockSwitch).not.toBeChecked();

      // Click reset password key button
      await userRow.locator('[data-testid^="reset-password-btn-"]').click();
      
      // Wait for dialog
      const dialog = globalAdminPage.getByRole('dialog');
      await expect(dialog).toBeVisible();
      
      // Fill new password
      const newPassword = 'newPassword123!';
      await globalAdminPage.getByTestId('new-password-input').fill(newPassword);
      
      // Click confirm
      const resetPromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/reset-password') && resp.status() === 200);
      await globalAdminPage.getByTestId('confirm-reset-password-btn').click();
      await resetPromise;
      
      // Wait for dialog closure
      await expect(dialog).toBeHidden();
      
      // Log out regular user and verify they can log back in with the new password
      await regularPage.goto('/home');
      await regularPage.getByTestId('user-settings-button').click();
      await regularPage.getByTestId('logout-menu-item').click();
      await expect(regularPage).toHaveURL('/');
      
      const updatedRegularUser = { ...regularUser, password: newPassword };
      await regularPage.goto('/login');
      await regularPage.getByTestId('login-email').fill(updatedRegularUser.username);
      await regularPage.getByTestId('login-password').fill(updatedRegularUser.password);
      await regularPage.getByTestId('login-submit').click();
      await expect(regularPage).toHaveURL('/home');
    });

    // 7. Manage organization admins
    await test.step('7. Add and remove organization admins', async () => {
      // Go to Organizations tab on globalAdminPage
      await globalAdminPage.goto('/admin');
      await globalAdminPage.getByRole('tab', { name: /Organizações|Organizations/i }).click();

      // Search for the organization
      const orgSearchInput = globalAdminPage.getByPlaceholder(/Buscar organização|Search organization/i);
      await orgSearchInput.click();
      await orgSearchInput.clear();
      await orgSearchInput.pressSequentially(orgName);
      const orgResponsePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/admin/organizations') && resp.status() === 200);
      await orgSearchInput.press('Enter');
      await orgResponsePromise;

      const orgRow = globalAdminPage.locator('tr').filter({ hasText: orgName });
      await orgRow.locator('[data-testid^="manage-admins-btn-"]').click();

      // Dialog should open
      const dialog = globalAdminPage.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Search for regularUser to add them as admin
      await globalAdminPage.getByTestId('admin-search-input').fill(regularUser.username);
      const searchUsersPromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/users/search') && resp.status() === 200);
      await globalAdminPage.getByTestId('search-admin-users-btn').click();
      await searchUsersPromise;

      // Add regularUser as admin
      const addAdminPromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/admins') && resp.status() === 200);
      await globalAdminPage.locator('[data-testid^="add-admin-btn-"]').click();
      await addAdminPromise;

      // Confirm they are added to the list of admins
      await expect(dialog.getByText(regularUser.name)).toBeVisible();

      // Verify on regularPage (regular user context) that they can manage the organization
      await regularPage.goto('/home');
      await regularPage.reload();
      await regularPage.waitForLoadState('networkidle');
      
      // Verify organization shows up in administered list
      await expect(regularPage.getByTestId('admin-orgs-list')).toContainText(orgName);

      // Now remove the regularUser from admins on globalAdminPage
      const removeAdminPromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/admins/') && resp.status() === 200);
      // Click delete icon next to regularUser name
      await dialog.locator('li').filter({ hasText: regularUser.name }).locator('[data-testid^="remove-admin-btn-"]').click();
      await removeAdminPromise;

      // Confirm they are removed from current admins list
      await expect(dialog.getByText(regularUser.name)).toBeHidden();

      // Try to remove the last admin (orgAdminUser) - the remove button should be disabled
      const lastAdminItem = dialog.locator('li').filter({ hasText: orgAdminUser.name });
      const removeLastAdminBtn = lastAdminItem.locator('[data-testid^="remove-admin-btn-"]');
      await expect(removeLastAdminBtn).toBeDisabled();

      // Close Dialog
      await globalAdminPage.getByRole('button', { name: /Fechar|Close/i }).click();
      await expect(dialog).toBeHidden();
    });

    // 8. Remove user and verify cascading deletion
    await test.step('8. Remove user and check cascading deletion', async () => {
      await globalAdminPage.goto('/admin');
      await globalAdminPage.getByRole('tab', { name: /Usuários|Users/i }).click();

      // Search for regular user
      const userSearchInput = globalAdminPage.getByPlaceholder(/Buscar por nome|Search by name/i);
      await userSearchInput.click();
      await userSearchInput.clear();
      await userSearchInput.pressSequentially(regularUser.name);
      const userResponsePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/users/search') && resp.status() === 200);
      await userSearchInput.press('Enter');
      await userResponsePromise;

      const userRow = globalAdminPage.locator('tr').filter({ hasText: regularUser.name });
      await userRow.locator('[data-testid^="delete-user-btn-"]').click();

      // Wait for confirm delete dialog
      const deleteDialog = globalAdminPage.getByRole('dialog');
      await expect(deleteDialog).toBeVisible();

      // Click Excluir / Confirm
      const deletePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/user/') && resp.status() === 204);
      await globalAdminPage.getByTestId('confirm-delete-user-btn').click();
      await deletePromise;

      // Wait for dialog to disappear and search to show empty results
      await expect(deleteDialog).toBeHidden();
      await expect(globalAdminPage.locator('tr').filter({ hasText: regularUser.name })).toBeHidden();

      // Verify regular user cannot log in anymore
      await regularPage.goto('/home');
      await regularPage.getByTestId('user-settings-button').click();
      await regularPage.getByTestId('logout-menu-item').click();
      await expect(regularPage).toHaveURL('/');

      await regularPage.goto('/login');
      await regularPage.getByTestId('login-email').fill(regularUser.username);
      await regularPage.getByTestId('login-password').fill('newPassword123!');
      await regularPage.getByTestId('login-submit').click();
      // Should show a login error toast or alert and not redirect to /home
      await expect(regularPage).not.toHaveURL('/home');
    });

    // 9. Remove organization and verify deletion
    await test.step('9. Remove organization and check deletion', async () => {
      await globalAdminPage.goto('/admin');
      await globalAdminPage.getByRole('tab', { name: /Organizações|Organizations/i }).click();

      // Search for the organization
      const orgSearchInput = globalAdminPage.getByPlaceholder(/Buscar organização|Search organization/i);
      await orgSearchInput.click();
      await orgSearchInput.clear();
      await orgSearchInput.pressSequentially(orgName);
      const orgResponsePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/admin/organizations') && resp.status() === 200);
      await orgSearchInput.press('Enter');
      await orgResponsePromise;

      const orgRow = globalAdminPage.locator('tr').filter({ hasText: orgName });
      await expect(orgRow).toBeVisible();

      // Click delete icon next to the organization name
      await orgRow.locator('[data-testid^="delete-org-btn-"]').click();

      // Wait for confirm delete dialog
      const deleteDialog = globalAdminPage.getByRole('dialog');
      await expect(deleteDialog).toBeVisible();

      // Click Excluir / Confirm
      const deletePromise = globalAdminPage.waitForResponse(resp => resp.url().includes('/api/organizations/') && resp.status() === 200);
      await globalAdminPage.getByTestId('confirm-delete-org-btn').click();
      await deletePromise;

      // Wait for dialog to disappear and search to show empty results
      await expect(deleteDialog).toBeHidden();
      await expect(globalAdminPage.locator('tr').filter({ hasText: orgName })).toBeHidden();

      // Verify orgAdmin cannot view the organization anymore (should be removed from home list)
      await orgAdminPage.goto('/home');
      await orgAdminPage.reload();
      await orgAdminPage.waitForLoadState('networkidle');
      await expect(orgAdminPage.getByTestId('admin-orgs-list')).not.toContainText(orgName);
    });

    // Cleanup contexts
    await globalAdminContext.close();
    await regularContext.close();
    await orgAdminContext.close();

    await saveVideo(globalAdminPage, 'globaladmin-flow', testInfo);
    await saveVideo(regularPage, 'blocked-user-flow', testInfo);
    await saveVideo(orgAdminPage, 'blocked-org-flow', testInfo);
  });
});
