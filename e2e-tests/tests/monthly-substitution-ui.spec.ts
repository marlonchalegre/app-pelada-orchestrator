import { test, expect } from "@playwright/test";
import { registerAndCreateOrg, createPlayerViaApi, getApiContext, getOrgIdFromUrl } from "./utils";

test("UI Substitutions - permanent excluded after active substitution", async ({ page, request }) => {
  test.setTimeout(120000);
  const timestamp = Date.now() + Math.floor(Math.random() * 1000);
  const admin = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: "password123",
  };
  const player2Name = `P2 ${timestamp}`;
  const orgName = `UI Sub Org ${timestamp}`;

  await registerAndCreateOrg(page, admin, orgName);
  const orgId = getOrgIdFromUrl(page.url());
  const api = await getApiContext(page, request);

  await createPlayerViaApi(api, orgId, player2Name);

  // Go to management
  await page.getByText(/GERENCIAMENTO|MANAGEMENT/i).click();
  await page.waitForURL(/\/organizations\/\d+\/management/);

  // Make admin mensalista
  const adminItem = page.getByTestId("player-item").filter({ hasText: admin.name });
  await expect(adminItem).toBeVisible();
  const adminSelect = adminItem.getByTestId(/member-type-select-/);
  await adminSelect.click();
  await page.getByRole("option", { name: /Mensalista/i }).first().click();

  // Create substitution admin <- player2
  await page.getByTestId("mgmt-tab-substitutions").click();
  await page.getByRole("button", { name: /Adicionar|Add/i }).click();

  await page.getByTestId("permanent-player-select").click();
  await page.getByRole("option", { name: new RegExp(admin.name, "i") }).click();

  await page.getByTestId("temporary-player-select").click();
  await page.getByRole("option", { name: new RegExp(player2Name, "i") }).click();

  await page.getByRole("button", { name: /Confirmar|Confirm/i }).click();

  // Open add dialog again and confirm admin is not listed as permanent (no longer mensalista)
  await page.getByRole("button", { name: /Adicionar|Add/i }).click();
  await page.getByTestId("permanent-player-select").click();
  await expect(page.getByRole("option", { name: new RegExp(admin.name, "i") })).toHaveCount(0);
});