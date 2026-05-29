import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import {
  registerUser,
  createOrganization,
  grantOrgCreation,
  getOrgIdFromUrl,
} from './utils';

function promoteToGlobalAdmin(email: string) {
  const cmd = `docker compose -f ../docker-compose.yml exec -T postgres psql -U pelada -d peladaapp -c "UPDATE \\"e2e\\".\\"Users\\" SET is_super_admin = TRUE WHERE email = '${email}';"`;
  execSync(cmd);
}

test.describe('Premium Feature Flags Workflows', () => {
  const timestamp = Date.now() + Math.floor(Math.random() * 10000);

  const orgAdminUser = {
    name: `Org Admin ${timestamp}`,
    username: `orgadmin_${timestamp}`,
    email: `orgadmin-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };

  const globalAdminUser = {
    name: `Global Admin ${timestamp}`,
    username: `superadmin_${timestamp}`,
    email: `superadmin-${timestamp}@example.com`,
    password: 'password123',
    position: 'Midfielder',
  };

  const orgName = `Premium Test Org ${timestamp}`;

  test('Should restrict premium features initially and unlock them when toggled by Global Admin', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};

    const orgAdminContext = await browser.newContext(videoOptions);
    const orgAdminPage = await orgAdminContext.newPage();

    const globalAdminContext = await browser.newContext(videoOptions);
    const globalAdminPage = await globalAdminContext.newPage();

    let orgId = '';

    // 1. Register Org Admin and create organization
    await test.step('1. Create organization as Org Admin', async () => {
      await registerUser(orgAdminPage, orgAdminUser);
      grantOrgCreation(orgAdminUser.email);
      await orgAdminPage.reload();
      await orgAdminPage.waitForLoadState('networkidle');
      await createOrganization(orgAdminPage, orgName);
      
      const orgUrl = orgAdminPage.url();
      orgId = getOrgIdFromUrl(orgUrl);
      expect(orgId).not.toBeNull();
    });

    // 2. Verify features are locked for the organization admin
    await test.step('2. Verify premium features are locked initially', async () => {
      // 2.1 Verify Statistics button is disabled on Detail Page
      await orgAdminPage.goto(`/organizations/${orgId}`);
      await orgAdminPage.waitForLoadState('networkidle');
      const statsButton = orgAdminPage.getByTestId('org-statistics-button');
      await expect(statsButton).toBeDisabled();

      // 2.2 Go to Management Page and verify Premium locks on tabs
      await orgAdminPage.goto(`/organizations/${orgId}/management`);
      await orgAdminPage.waitForLoadState('networkidle');

      // Click tab: Finance
      await orgAdminPage.getByTestId('mgmt-tab-finance').click();
      await expect(orgAdminPage.getByText(/Controle Financeiro Premium/i)).toBeVisible();

      // Click tab: Substitutions
      await orgAdminPage.getByTestId('mgmt-tab-substitutions').click();
      await expect(orgAdminPage.getByText(/Substituições de Mensalistas/i)).toBeVisible();

      // Click tab: Ratings
      await orgAdminPage.getByTestId('mgmt-tab-ratings').click();
      await expect(orgAdminPage.getByText(/Avaliações e Características de Jogadores/i)).toBeVisible();

      // Click tab: WAHA
      await orgAdminPage.getByTestId('mgmt-tab-waha').click();
      await expect(orgAdminPage.getByText(/Comunicações Automatizadas via WhatsApp/i)).toBeVisible();
    });

    // 3. Register Global Admin, promote, and log in to Admin Panel
    await test.step('3. Login as Global Admin and enable feature flags', async () => {
      await registerUser(globalAdminPage, globalAdminUser);
      promoteToGlobalAdmin(globalAdminUser.email);

      // Log out and log back in to get superadmin cookie
      await globalAdminPage.getByTestId('user-settings-button').click();
      await globalAdminPage.getByTestId('logout-menu-item').click();
      await expect(globalAdminPage).toHaveURL('/');

      await globalAdminPage.goto('/login');
      await globalAdminPage.getByTestId('login-email').fill(globalAdminUser.username);
      await globalAdminPage.getByTestId('login-password').fill(globalAdminUser.password);
      await globalAdminPage.getByTestId('login-submit').click();
      await expect(globalAdminPage).toHaveURL('/home');

      // Go to Admin Panel
      await globalAdminPage.goto('/admin');
      await globalAdminPage.getByRole('tab', { name: /Organizações|Organizations/i }).click();

      // Search for our organization
      const orgSearchInput = globalAdminPage.getByPlaceholder(/Buscar organização|Search organization/i);
      await orgSearchInput.click();
      await orgSearchInput.pressSequentially(orgName);
      
      const orgResponsePromise = globalAdminPage.waitForResponse(
        resp => resp.url().includes('/api/admin/organizations') && resp.status() === 200
      );
      await orgSearchInput.press('Enter');
      await orgResponsePromise;

      const orgRow = globalAdminPage.locator('tr').filter({ hasText: orgName });
      await expect(orgRow).toBeVisible();

      // Click feature flags button
      await orgRow.locator(`[data-testid="manage-feature-flags-btn-${orgId}"]`).click();

      // Dialog should open
      const dialog = globalAdminPage.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Toggle switches: finance_control, monthly_substitutions, player_characteristics, waha_communications, org_statistics
      await globalAdminPage.getByTestId('switch-finance_control').click();
      await globalAdminPage.getByTestId('switch-monthly_substitutions').click();
      await globalAdminPage.getByTestId('switch-player_characteristics').click();
      await globalAdminPage.getByTestId('switch-waha_communications').click();
      await globalAdminPage.getByTestId('switch-org_statistics').click();

      // Save
      const savePromise = globalAdminPage.waitForResponse(
        resp => resp.url().includes(`/api/admin/organizations/${orgId}/feature-flags`) && resp.status() === 200
      );
      await globalAdminPage.getByRole('button', { name: /Salvar|Save/i }).click();
      await savePromise;

      // Dialog should close
      await expect(dialog).toBeHidden();
    });

    // 4. Verify features are now unlocked for Org Admin
    await test.step('4. Verify premium features are unlocked for Org Admin', async () => {
      // 4.1 Verify Statistics button is now enabled
      await orgAdminPage.goto(`/organizations/${orgId}`);
      await orgAdminPage.waitForLoadState('networkidle');
      const statsButton = orgAdminPage.getByTestId('org-statistics-button');
      await expect(statsButton).toBeEnabled();

      // 4.2 Go to Management Page and verify no Premium locks on tabs
      await orgAdminPage.goto(`/organizations/${orgId}/management`);
      await orgAdminPage.waitForLoadState('networkidle');

      // Click tab: Finance - lock should be gone
      await orgAdminPage.getByTestId('mgmt-tab-finance').click();
      await expect(orgAdminPage.getByText(/Controle Financeiro Premium/i)).toBeHidden();

      // Click tab: Substitutions - lock should be gone
      await orgAdminPage.getByTestId('mgmt-tab-substitutions').click();
      await expect(orgAdminPage.getByText(/Substituições de Mensalistas/i)).toBeHidden();

      // Click tab: Ratings - lock should be gone
      await orgAdminPage.getByTestId('mgmt-tab-ratings').click();
      await expect(orgAdminPage.getByText(/Avaliações e Características de Jogadores/i)).toBeHidden();

      // Click tab: WAHA - lock should be gone
      await orgAdminPage.getByTestId('mgmt-tab-waha').click();
      await expect(orgAdminPage.getByText(/Comunicações Automatizadas via WhatsApp/i)).toBeHidden();
    });

    // Clean up contexts
    await orgAdminContext.close();
    await globalAdminContext.close();
  });
});
