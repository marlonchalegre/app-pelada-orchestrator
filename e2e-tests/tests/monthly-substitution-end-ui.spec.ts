import { test, expect } from "@playwright/test";
import { registerAndCreateOrg, createPlayerViaApi, getApiContext, getOrgIdFromUrl } from "./utils";

test("UI Substitutions - end substitution via UI reverts statuses", async ({ page, request }) => {
  test.setTimeout(120000);
  const timestamp = Date.now();
  const admin = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: "password123",
  };
  const p2 = `P2 ${timestamp}`;
  const orgName = `End UI Org ${timestamp}`;

  await registerAndCreateOrg(page, admin, orgName);
  const orgId = getOrgIdFromUrl(page.url());
  const api = await getApiContext(page, request);

  await createPlayerViaApi(api, orgId, p2);

  // Make admin mensalista and create substitution
  await page.getByText(/GERENCIAMENTO|MANAGEMENT/i).click();
  await page.waitForURL(/\/organizations\/[^\/]+\/management/);
  const adminItem = page.getByTestId("player-item").filter({ hasText: admin.name });
  await adminItem.getByTestId(/member-type-select-.*/).first().click();
  await page.getByRole("option", { name: /Mensalista/i }).first().click();

  await page.getByTestId("mgmt-tab-substitutions").click();
  await page.getByRole("button", { name: /Adicionar|Add/i }).click();
  await page.getByTestId("permanent-player-select").click();
  await page.getByRole("option", { name: new RegExp(admin.name, "i") }).click();
  await page.getByTestId("temporary-player-select").click();
  await page.getByRole("option", { name: new RegExp(p2, "i") }).click();
  await page.getByRole("button", { name: /Confirmar|Confirm/i }).click();

  // End substitution
  await page.locator('button:has(svg[data-testid="StopIcon"])').click();

  // Verify statuses reverted in members tab
  await page.getByTestId('mgmt-tab-members').click();
  await expect(page.getByText(/Mensalista/i)).toHaveCount(1);
  await expect(page.getByText(/Diarista/i)).toHaveCount(1);
});