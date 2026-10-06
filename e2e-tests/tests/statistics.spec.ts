import { test, expect } from "@playwright/test";
import {
  saveVideo,
  registerAndCreateOrg,
  setupMatchDay,
  getOrgIdFromUrl,
} from "./utils";

test.describe("Organization Statistics", () => {
  const timestamp = Date.now();
  const owner = {
    name: `Stats Owner ${timestamp}`,
    username: `stats_owner_${timestamp}`,
    email: `stats-owner-${timestamp}@example.com`,
    password: "password123",
    position: "Defender",
  };
  const orgName = `Stats Org ${timestamp}`;

  test("should display statistics and filters correctly", async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath("raw-videos") } }
      : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());

    await test.step("Setup", async () => {
      await registerAndCreateOrg(page, owner, orgName);
    });

    await test.step("Access Statistics Page", async () => {
      await page.getByTestId("org-statistics-button").click();
      await expect(page).toHaveURL(/\/organizations\/[^\/]+\/statistics/);
      await expect(
        page.getByRole("heading", { name: new RegExp(orgName) }),
      ).toBeVisible();
      await expect(
        page.getByText(/Estatísticas da temporada|Season statistics/i),
      ).toBeVisible();
    });

    await test.step("Verify Metric Tabs", async () => {
      await expect(page.getByRole("button", { name: "GOLS" })).toBeVisible();
      await expect(page.getByRole("button", { name: "ASSISTÊNCIAS" })).toBeVisible();
      await expect(page.getByRole("button", { name: "PRESENÇA" })).toBeVisible();
      await expect(page.getByRole("button", { name: "TÍTULOS" })).toBeVisible();
      await expect(page.getByRole("button", { name: "NOTA" })).toBeVisible();

      await page.getByRole("button", { name: "ASSISTÊNCIAS" }).click();
      await page.getByRole("button", { name: "GOLS" }).click();
    });

    await test.step("Verify Export Button", async () => {
      await expect(page.getByTestId("export-stats-button")).toBeVisible();
    });

    await context.close();
    await saveVideo(page, "organization-statistics", testInfo);
  });

  test("should import manual statistics successfully", async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath("raw-videos") } }
      : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    await test.step("Setup", async () => {
      const ts = timestamp + 1000;
      const importOwner = {
        ...owner,
        username: owner.username + "i",
        email: "i" + owner.email,
      };
      const importOrgName = `${orgName} Import`;
      await registerAndCreateOrg(page, importOwner, importOrgName);
    });

    await test.step("Navigate to Statistics and Open Import Dialog", async () => {
      await page.reload();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/players") && response.status() === 200,
      );
      await page
        .getByTestId("org-statistics-button")
        .or(page.locator(`a[href*="/statistics"]`))
        .first()
        .click();
      await responsePromise;

      await expect(page.getByTestId("import-stats-button")).toBeVisible({
        timeout: 15000,
      });
      await page.getByTestId("import-stats-button").click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });

    await test.step("Add Manual Entry", async () => {
      await page.getByTestId("add-manual-row-button").click();
      await expect(page.getByTestId("import-row-0")).toBeVisible();

      await page.getByTestId("player-autocomplete-input-0").fill(owner.name);
      await page.getByRole("option", { name: owner.name }).click();

      await page.getByTestId("goals-input-0").fill("5");
      await page.getByTestId("assists-input-0").fill("3");
      await page.getByTestId("own-goals-input-0").fill("1");
      await page.getByTestId("import-confirm-button").click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });
    });

    await test.step("Verify Statistics in Table", async () => {
      const row = page
        .getByTestId("stats-player-row")
        .or(page.locator("tr"))
        .filter({ hasText: owner.name })
        .first();
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row.getByText("5").first()).toBeVisible();

      await page.getByRole("button", { name: "ASSISTÊNCIAS" }).click();
      await expect(row.getByText("3").first()).toBeVisible();
    });

    await context.close();
    await saveVideo(page, "manual-stats", testInfo);
  });
});

test.describe("Player Statistics on Home Page", () => {
  const timestamp = Date.now();
  const owner = {
    name: `Player Stats Owner ${timestamp}`,
    username: `pstats_owner_${timestamp}`,
    email: `pstats-owner-${timestamp}@example.com`,
    password: "password123",
    position: "Midfielder",
  };
  const orgName = `Player Stats Org ${timestamp}`;

  test("should compute and display matches, active groups, goals, and assists correctly", async ({
    browser,
  }, testInfo) => {
    const videoOptions = process.env.VIDEO
      ? { recordVideo: { dir: testInfo.outputPath("raw-videos") } }
      : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();

    const ts = timestamp + 2000;
    const player2 = {
      name: `Player2 ${ts}`,
      username: `p2_${ts}`,
      email: `p2-${ts}@example.com`,
      password: "password123",
    };

    let peladaId = "";
    let orgId = "";

    await test.step("Setup Match Day", async () => {
      // setupMatchDay registers the owner, invites player2, creates a pelada,
      // sets up teams, schedules, and starts the pelada (redirecting to /peladas/${peladaId}/matches).
      const setupRes = await setupMatchDay(
        page,
        browser,
        owner,
        orgName,
        player2,
      );
      peladaId = setupRes.peladaId;
      orgId = setupRes.orgId;
    });

    await test.step("Verify Initial Stats on Home Page", async () => {
      // Go to Home
      await page.goto("/home");
      await page.waitForLoadState("networkidle");

      // Verify stats are initialized (matches: 0, groups: 1, goals/assists: 0)
      // Note: matches is 0 because the pelada is still "open", not "closed"
      await expect(page.getByTestId("home-stats-matches")).toHaveText("0");
      await expect(page.getByTestId("home-stats-groups")).toHaveText("1");
      await expect(page.getByTestId("home-stats-goals-assists")).toContainText(
        "0",
      );
    });

    await test.step("Complete Pelada to Increment Matches Played", async () => {
      // Go back to the pelada matches page
      await page.goto(`/peladas/${peladaId}/matches`);
      await page.waitForLoadState("networkidle");

      // Go to Classificação (Standings) tab and close the Pelada
      await page
        .getByTestId("pill-tab-standings")
        .or(page.getByTestId("go-to-standings-button"))
        .or(page.getByRole("tab", { name: /Classificação|Standings|TABELA/i }))
        .first()
        .click();
      const closeBtn = page.getByTestId("close-pelada-button");
      await expect(closeBtn).toBeVisible({ timeout: 15000 });
      await closeBtn.click();
      await page.getByTestId("pretty-confirm-button").click();

      // Navigate back to Home and verify Matches Played updated to 1
      await page.goto("/home");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("home-stats-matches")).toHaveText("1");
    });

    await test.step("Import Manual Stats and Verify Goals and Assists", async () => {
      // Navigate to Statistics
      await page.goto(`/organizations/${orgId}/statistics`);
      await page.waitForLoadState("networkidle");

      // Open import dialog
      await expect(page.getByTestId("import-stats-button")).toBeVisible({
        timeout: 15000,
      });
      await page.getByTestId("import-stats-button").click();
      await expect(page.getByRole("dialog")).toBeVisible();

      // Add row and fill
      await page.getByTestId("add-manual-row-button").click();
      await expect(page.getByTestId("import-row-0")).toBeVisible();

      await page.getByTestId("player-autocomplete-input-0").fill(owner.name);
      await page.getByRole("option", { name: owner.name }).click();

      await page.getByTestId("goals-input-0").fill("7");
      await page.getByTestId("assists-input-0").fill("4");
      await page.getByTestId("import-confirm-button").click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });

      // Navigate back to Home and verify Goals and Assists updated
      await page.goto("/home");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("home-stats-goals-assists")).toContainText(
        "7",
      );
      await expect(page.getByTestId("home-stats-goals-assists")).toContainText(
        "4",
      );
    });

    await context.close();
    await saveVideo(page, "player-stats-home-page", testInfo);
  });
});
