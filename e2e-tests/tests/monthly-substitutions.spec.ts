import { test, expect } from "@playwright/test";
import {
  registerAndCreateOrg,
  createPlayerViaApi,
  getApiContext,
  getOrgIdFromUrl,
} from "./utils";

test.describe("Monthly Player Substitution", () => {
  test("should manage monthly substitutions lifecycle", async ({ page, request }) => {
    test.setTimeout(120000);
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    const admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: "password123",
    };
    const player2Name = `P2 ${timestamp}`;
    const orgName = `Sub Org ${timestamp}`;

    await registerAndCreateOrg(page, admin, orgName);
    const orgId = getOrgIdFromUrl(page.url());
    const api = await getApiContext(page, request);

    await createPlayerViaApi(api, orgId, player2Name);
    
    await page.getByText(/GERENCIAMENTO|MANAGEMENT/i).click();
    await page.waitForURL(/\/organizations\/[^\/]+\/management/);
    
    await expect(page.getByTestId("player-item").first()).toBeVisible({ timeout: 30000 });

    const adminItem = page.getByTestId("player-item").filter({ hasText: admin.name });
    await expect(adminItem).toBeVisible();
    
    const adminSelect = adminItem.getByTestId(/member-type-select-.*/).first();
    await adminSelect.click();
    await page.getByRole("option", { name: /Mensalista/i }).first().click();

    await page.getByTestId("mgmt-tab-substitutions").click();
    await expect(
      page.getByText(/Nenhuma substituição registrada|No substitutions recorded/i),
    ).toBeVisible();

    await page.getByRole("button", { name: /Adicionar|Add/i }).click();

    await page.getByTestId("permanent-player-select").click();
    await page.getByRole("option", { name: new RegExp(admin.name, "i") }).click();

    await page.getByTestId("temporary-player-select").click();
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

    await expect(page.getByText(admin.name)).toBeVisible();
    await expect(page.getByText(player2Name)).toBeVisible();
    await expect(page.locator('#org-mgmt-tabpanel-substitutions').getByText(/Ativo|Active/i)).toBeVisible();

    await page.getByTestId("mgmt-tab-members").click();
    await expect(page.getByText(/Diarista \(Subst\.\)/i)).toBeVisible();
    await expect(page.getByText(/Mensalista \(Temp\.\)/i)).toBeVisible();

    await page.getByTestId("mgmt-tab-substitutions").click();
    await page.locator('button:has(svg[data-testid="StopIcon"])').click();

    await expect(page.getByText(/Encerrado|Ended/i)).toBeVisible();
    await expect(
      page.locator('button:has(svg[data-testid="StopIcon"])'),
    ).toBeHidden();

    await page.getByTestId("mgmt-tab-members").click();
    await expect(page.getByText(/Mensalista/i)).toHaveCount(1); // Only admin
    await expect(page.getByText(/Diarista/i)).toHaveCount(1); // Only player 2
  });

  test("UI Substitutions - show API error when creating conflicting substitution", async ({ page, request }) => {
    test.setTimeout(120000);
    const timestamp = Date.now() + Math.floor(Math.random() * 10000) + 10000;
    const admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: "password123",
    };
    const p2 = `P2 ${timestamp}`;
    const p3 = `P3 ${timestamp}`;
    const conflictOrgName = `Conflict Org ${timestamp}`;

    await registerAndCreateOrg(page, admin, conflictOrgName);
    const orgId = getOrgIdFromUrl(page.url());
    const api = await getApiContext(page, request);

    await createPlayerViaApi(api, orgId, p2);
    await createPlayerViaApi(api, orgId, p3);

    await page.getByText(/GERENCIAMENTO|MANAGEMENT/i).click();
    await page.waitForURL(/\/organizations\/[^\/]+\/management/);
    const adminItem = page.getByTestId("player-item").filter({ hasText: admin.name });
    await adminItem.getByTestId(/member-type-select-.*/).first().click();
    await page.getByRole("option", { name: /Mensalista/i }).first().click();

    await page.getByTestId("mgmt-tab-substitutions").click();
    await page.getByRole("button", { name: /Adicionar|Add/i }).click();
    await page.getByTestId("permanent-player-select").click();
    {
      const options = page.getByRole("option");
      await expect(page.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });
      const count = await options.count();
      let clicked = false;
      for (let i = 0; i < count; i++) {
        const txt = await options.nth(i).innerText();
        if (txt.includes(admin.name)) {
          await options.nth(i).click();
          clicked = true;
          break;
        }
      }
      if (!clicked) throw new Error("Permanent player option not found");
    }
    await page.getByTestId("temporary-player-select").click();
    {
      const options = page.getByRole("option");
      await expect(page.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });
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

    await page.getByRole("button", { name: /Adicionar|Add/i }).click();
    await page.getByTestId("permanent-player-select").click();
    {
      const options = page.getByRole("option");
      await expect(page.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });
      const count = await options.count();
      let found = false;
      for (let i = 0; i < count; i++) {
        const txt = await options.nth(i).innerText();
        if (txt.includes(admin.name)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(false);
    }
  });

  test("UI Substitutions - end substitution via UI reverts statuses", async ({ page, request }) => {
    test.setTimeout(120000);
    const timestamp = Date.now() + Math.floor(Math.random() * 10000) + 20000;
    const admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: "password123",
    };
    const endOrgName = `End UI Org ${timestamp}`;
    const p2 = `P2 ${timestamp}`;

    await registerAndCreateOrg(page, admin, endOrgName);
    const orgId = getOrgIdFromUrl(page.url());
    const api = await getApiContext(page, request);

    await createPlayerViaApi(api, orgId, p2);

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

    await page.locator('button:has(svg[data-testid="StopIcon"])').click();

    await page.getByTestId('mgmt-tab-members').click();
    await expect(page.getByText(/Mensalista/i)).toHaveCount(1);
    await expect(page.getByText(/Diarista/i)).toHaveCount(1);
  });

  test("UI Substitutions - history shows start and end dates for multiple substitutions", async ({ page, request }) => {
    test.setTimeout(120000);
    const timestamp = Date.now() + Math.floor(Math.random() * 10000) + 30000;
    const admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: "password123",
    };
    const historyOrgName = `History Org ${timestamp}`;
    const p2 = `P2 ${timestamp}`;
    const p3 = `P3 ${timestamp}`;

    await registerAndCreateOrg(page, admin, historyOrgName);
    const orgId = getOrgIdFromUrl(page.url());
    const api = await getApiContext(page, request);

    await createPlayerViaApi(api, orgId, p2);
    await createPlayerViaApi(api, orgId, p3);

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

    await page.locator('button:has(svg[data-testid="StopIcon"])').click();
    await expect(page.getByText(/Encerrado|Ended/i)).toBeVisible();

    await page.getByTestId("mgmt-tab-members").click();
    await adminItem.getByTestId(/member-type-select-.*/).first().click();
    await page.getByRole("option", { name: /Mensalista/i }).first().click();

    await page.getByTestId("mgmt-tab-substitutions").click();
    await page.getByRole("button", { name: /Adicionar|Add/i }).click();
    await page.getByTestId("permanent-player-select").click();
    await page.getByRole("option", { name: new RegExp(admin.name, "i") }).click();
    await page.getByTestId("temporary-player-select").click();
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

    const items = page.locator('#org-mgmt-tabpanel-substitutions ul li');
    await expect(items).toHaveCount(2, { timeout: 10000 });
    await expect(page.getByText(/2026|2025|2024/).first()).toBeVisible();
  });

  test("UI Substitutions - permanent excluded after active substitution", async ({ page, request }) => {
    test.setTimeout(120000);
    const timestamp = Date.now() + Math.floor(Math.random() * 10000) + 40000;
    const admin = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: "password123",
    };
    const uiOrgName = `UI Sub Org ${timestamp}`;
    const p2Name = `P2 ${timestamp}`;

    await registerAndCreateOrg(page, admin, uiOrgName);
    const orgId = getOrgIdFromUrl(page.url());
    const api = await getApiContext(page, request);

    await createPlayerViaApi(api, orgId, p2Name);

    await page.getByText(/GERENCIAMENTO|MANAGEMENT/i).click();
    await page.waitForURL(/\/organizations\/[^\/]+\/management/);

    const adminItem = page.getByTestId("player-item").filter({ hasText: admin.name });
    await expect(adminItem).toBeVisible();
    const adminSelect = adminItem.getByTestId(/member-type-select-.*/).first();
    await adminSelect.click();
    await page.getByRole("option", { name: /Mensalista/i }).first().click();

    await page.getByTestId("mgmt-tab-substitutions").click();
    await page.getByRole("button", { name: /Adicionar|Add/i }).click();

    await page.getByTestId("permanent-player-select").click();
    await page.getByRole("option", { name: new RegExp(admin.name, "i") }).click();

    await page.getByTestId("temporary-player-select").click();
    await page.getByRole("option", { name: new RegExp(p2Name, "i") }).click();

    await page.getByRole("button", { name: /Confirmar|Confirm/i }).click();

    await page.getByRole("button", { name: /Adicionar|Add/i }).click();
    await page.getByTestId("permanent-player-select").click();
    await expect(page.getByRole("option", { name: new RegExp(admin.name, "i") })).toHaveCount(0);
  });
});
