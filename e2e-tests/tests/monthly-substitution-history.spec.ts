import { test, expect } from "@playwright/test";
import { registerAndCreateOrg, createPlayerViaApi, getApiContext, getOrgIdFromUrl } from "./utils";

test("UI Substitutions - history shows start and end dates for multiple substitutions", async ({ page, request }) => {
  test.setTimeout(120000);
  const timestamp = Date.now();
  const admin = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin-${timestamp}@example.com`,
    password: "password123",
  };
  const p2 = `P2 ${timestamp}`;
  const p3 = `P3 ${timestamp}`;
  const orgName = `History Org ${timestamp}`;

  await registerAndCreateOrg(page, admin, orgName);
  const orgId = getOrgIdFromUrl(page.url());
  const api = await getApiContext(page, request);

  await createPlayerViaApi(api, orgId, p2);
  await createPlayerViaApi(api, orgId, p3);

  // Make admin mensalista and create/close two substitutions
  await page.getByText(/GERENCIAMENTO|MANAGEMENT/i).click();
  await page.waitForURL(/\/organizations\/\d+\/management/);
  const adminItem = page.getByTestId("player-item").filter({ hasText: admin.name });
  await adminItem.getByTestId(/member-type-select-/).click();
  await page.getByRole("option", { name: /Mensalista/i }).first().click();

  // First substitution admin <- p2
  await page.getByTestId("mgmt-tab-substitutions").click();
  await page.getByRole("button", { name: /Adicionar|Add/i }).click();
  await page.getByTestId("permanent-player-select").click();
  await page.getByRole("option", { name: new RegExp(admin.name, "i") }).click();
  await page.getByTestId("temporary-player-select").click();
  // pick a temporary option not equal to admin
  {
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
  }
  await page.getByRole("button", { name: /Confirmar|Confirm/i }).click();

  // End it
  await page.locator('button:has(svg[data-testid="StopIcon"])').click();
  await expect(page.getByText(/Encerrado|Ended/i)).toBeVisible();

  // Make admin mensalista again and create second substitution admin <- p3
  await page.getByTestId("mgmt-tab-members").click();
  await adminItem.getByTestId(/member-type-select-/).click();
  await page.getByRole("option", { name: /Mensalista/i }).first().click();

  await page.getByTestId("mgmt-tab-substitutions").click();
  await page.getByRole("button", { name: /Adicionar|Add/i }).click();
  await page.getByTestId("permanent-player-select").click();
  await page.getByRole("option", { name: new RegExp(admin.name, "i") }).click();
  await page.getByTestId("temporary-player-select").click();
  // pick a temporary option not equal to admin
  {
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
  }
  await page.getByRole("button", { name: /Confirmar|Confirm/i }).click();

  // Verify history shows at least 2 entries and contains dates
  const items = page.locator('#org-mgmt-tabpanel-substitutions ul li');
  await expect(items).toHaveCount(2, { timeout: 10000 });
  // Check that at least one item contains a date pattern YYYY
  await expect(page.getByText(/2026|2025|2024/).first()).toBeVisible();
});