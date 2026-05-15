import { test, expect } from "@playwright/test";
import {
  registerAndCreateOrg,
  createPlayerViaApi,
  getApiContext,
  getOrgIdFromUrl,
} from "./utils";

test.describe("Monthly Player Substitution", () => {
  let admin: any;
  let player2Name: string;
  let orgName: string;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000);
    const timestamp = Date.now() + Math.floor(Math.random() * 1000);
    admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: "password123",
    };
    player2Name = `P2 ${timestamp}`;
    orgName = `Sub Org ${timestamp}`;

    await registerAndCreateOrg(page, admin, orgName);
  });

  test("should manage monthly substitutions", async ({ page, request }) => {
    // Go to org page
    await page.getByTestId(`org-link-${orgName}`).click();
    await page.waitForURL(/\/organizations\/[^\/]+/);
    const orgId = getOrgIdFromUrl(page.url());
    const api = await getApiContext(page, request);

    // Create Player 2 via API so it's available for substitutions
    await createPlayerViaApi(api, orgId, player2Name);
    
    // Go to management page via button
    await page.getByText(/GERENCIAMENTO|MANAGEMENT/i).click();
    await page.waitForURL(/\/organizations\/[^\/]+\/management/);
    
    // Wait for any player item to appear
    await expect(page.getByTestId("player-item").first()).toBeVisible({ timeout: 30000 });

    // Find admin row and set to mensalista
    const adminItem = page.getByTestId("player-item").filter({ hasText: admin.name });
    await expect(adminItem).toBeVisible();
    
    const adminSelect = adminItem.getByTestId(/member-type-select-.*/).first();
    await adminSelect.click();
    await page.getByRole("option", { name: /Mensalista/i }).first().click();

    // 3. Go to substitutions tab
    await page.getByTestId("mgmt-tab-substitutions").click();
    await expect(
      page.getByText(/Nenhuma substituição registrada|No substitutions recorded/i),
    ).toBeVisible();

    // 4. Create substitution
    await page.getByRole("button", { name: /Adicionar|Add/i }).click();

    // Select permanent player (admin)
    await page.getByTestId("permanent-player-select").click();
    await page.getByRole("option", { name: new RegExp(admin.name, "i") }).click();

    // Select temporary player (Player 2)
    await page.getByTestId("temporary-player-select").click();
    // Choose the first option that is not the permanent (admin) — more robust than matching exact name
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible({ timeout: 10000 });
    const count = await options.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const txt = await options.nth(i).innerText();
      if (!txt.includes(admin.name)) {
        await options.nth(i).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) throw new Error("No suitable temporary player option found");

    await page.getByRole("button", { name: /Confirmar|Confirm/i }).click();

    // 5. Verify substitution listed
    await expect(page.getByText(admin.name)).toBeVisible();
    await expect(page.getByText(player2Name)).toBeVisible();
    await expect(page.locator('#org-mgmt-tabpanel-substitutions').getByText(/Ativo|Active/i)).toBeVisible();

    // 6. Verify statuses changed in members tab
    await page.getByTestId("mgmt-tab-members").click();
    // Admin should be Diarista (Subst.)
    await expect(page.getByText(/Diarista \(Subst\.\)/i)).toBeVisible();
    // Player 2 should be Mensalista (Temp.)
    await expect(page.getByText(/Mensalista \(Temp\.\)/i)).toBeVisible();

    // 7. End substitution
    await page.getByTestId("mgmt-tab-substitutions").click();
    await page.locator('button:has(svg[data-testid="StopIcon"])').click();

    // 8. Verify substitution ended
    await expect(page.getByText(/Encerrado|Ended/i)).toBeVisible();
    await expect(
      page.locator('button:has(svg[data-testid="StopIcon"])'),
    ).toBeHidden();

    // 9. Verify statuses reverted in members tab
    await page.getByTestId("mgmt-tab-members").click();
    await expect(page.getByText(/Mensalista/i)).toHaveCount(1); // Only admin
    await expect(page.getByText(/Diarista/i)).toHaveCount(1); // Only player 2
  });
});
