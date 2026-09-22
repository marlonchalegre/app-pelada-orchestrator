import { BrowserContext, Page, TestInfo, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Saves the video recorded for a page/context to a descriptive filename.
 * Should be called AFTER the context/page is closed to ensure the video file is flushed.
 */
export async function saveVideo(page: Page, name: string, testInfo: TestInfo) {
  if (!process.env.VIDEO) return;

  try {
    const video = page.video();
    if (!video) return;

    const newPath = testInfo.outputPath(`${name}.webm`);
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // saveAs is a promise that waits for the video to be saved.
    // It works even if the context is already closed (and it SHOULD be closed).
    await video.saveAs(newPath);

    // Playwright keeps the original video file even after saveAs.
    // We try to delete the original one to avoid duplicates in the raw-videos folder.
    try {
      const originalPath = await video.path();
      if (originalPath && fs.existsSync(originalPath)) {
        fs.unlinkSync(originalPath);
      }
    } catch (unlinkErr) {
      // Ignore errors deleting the original file
    }
  } catch (err) {
    console.error(`Failed to save video ${name}:`, err);
  }
}

/**
 * The redesigned UI renders some controls twice (desktop + mobile layouts).
 * Always target the visible instance to avoid strict-mode violations.
 */
export function visible(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}

export interface RegisterUserData {
  name: string;
  email: string;
  password: string;
  username?: string;
  /** Position value: Goalkeeper | Defender | Midfielder | Striker */
  position?: string;
}

/** Registers a brand new user through /register using stable test ids. */
export async function registerUser(page: Page, user: RegisterUserData) {
  await page.goto('/register');
  await page.getByTestId('register-name').fill(user.name);
  if (user.username) {
    await page.getByTestId('register-username').fill(user.username);
  }
  await page.getByTestId('register-email').fill(user.email);
  await page.getByTestId('register-password').fill(user.password);
  if (user.position) {
    await page.getByTestId('register-position-select').click();
    await page.getByTestId(`position-option-${user.position}`).click();
  }
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/($|home)/, { timeout: 15000 });
}

export interface FirstAccessUserData {
  name: string;
  username: string;
  password: string;
  position?: string;
}

/** Completes the first-access (invite) registration form. */
export async function completeFirstAccess(
  page: Page,
  user: FirstAccessUserData,
) {
  await page.getByTestId('first-access-name').fill(user.name);
  await page.getByTestId('first-access-username').fill(user.username);
  await page.getByTestId('first-access-password').fill(user.password);
  if (user.position) {
    await page.getByTestId('first-access-position-select').click();
    await page.getByTestId(`position-option-${user.position}`).click();
  }
  await page.getByTestId('first-access-submit').click();
  await expect(page).toHaveURL(/\/($|home)/, { timeout: 15000 });
}

/** Creates an organization from the home page and opens it. */
export async function createOrganization(page: Page, orgName: string) {
  await page.getByTestId('create-org-open-dialog').click();
  await page.getByTestId('org-name-input').fill(orgName);
  await page.getByTestId('org-submit-button').click();
  await page.getByTestId(`org-link-${orgName}`).click();
}

export interface InvitedPlayerData extends FirstAccessUserData {
  email: string;
}

/**
 * Invites a player from the org management page, registers them through the
 * first-access form and accepts the invitation. Returns the invited page so
 * the caller can keep interacting with it (e.g. attendance).
 */
export async function invitePlayerAndJoin(
  ownerPage: Page,
  invitedContext: BrowserContext,
  invitedUser: InvitedPlayerData,
  orgName: string,
): Promise<Page> {
  await ownerPage.getByTestId('org-management-button').click();
  await ownerPage.getByTestId('members-invite-button').click();
  await ownerPage.getByTestId('invite-email-input').fill(invitedUser.email);
  await ownerPage.getByTestId('send-invite-button').click();

  const invitationLinkLocator = ownerPage.getByTestId('invitation-link-text');
  await invitationLinkLocator.waitFor({ state: 'visible' });
  const invitationLinkText = await invitationLinkLocator.innerText();

  const invitedPage = await invitedContext.newPage();
  await invitedPage.goto(invitationLinkText);
  await completeFirstAccess(invitedPage, invitedUser);
  await acceptPendingInvitation(invitedPage, orgName);
  return invitedPage;
}

/**
 * Creates a pelada from the desktop org agenda quick-create form
 * (defaults: date +7 days, 19:00) and opens the new attendance list.
 */
export async function createPeladaFromAgenda(
  page: Page,
  location?: string,
) {
  if (location) {
    await page.getByTestId('desktop-quick-pelada-location-input').fill(location);
  }
  await page.getByRole('button', { name: 'CRIAR PELADA' }).click();
  // The desktop agenda does not redirect — open the fresh list from its row CTA.
  const openListBtn = page
    .getByRole('button', { name: 'FECHAR E SORTEAR' })
    .first();
  await expect(openListBtn).toBeVisible({ timeout: 15000 });
  await openListBtn.click();
  await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/, { timeout: 15000 });
}

/** Extracts the pelada id from an /peladas/:id... URL. */
export function peladaIdFromUrl(url: string): string | undefined {
  return url.match(/\/peladas\/(\d+)/)?.[1];
}

/**
 * The attendance close flow now asks for confirmation:
 * close-attendance-button opens a dialog confirmed by confirm-close-attendance-button.
 */
export async function closeAttendanceList(page: Page) {
  await visible(page, 'close-attendance-button').click();
  await visible(page, 'confirm-close-attendance-button').click();
  await expect(page).toHaveURL(/\/peladas\/\d+$/, { timeout: 15000 });
}

/**
 * Desktop teams page flow: draw teams with the COMO SORTEAR panel, then
 * start the pelada through SALVAR TIMES → StartPeladaDialog.
 * (randomize-teams-button / start-pelada-button no longer exist on desktop.)
 */
export async function drawAndStartPelada(page: Page) {
  await visible(page, 'draw-again-button').click();
  await expect(
    page.locator('[data-testid^="team-card-"]:visible').first(),
  ).toBeVisible({ timeout: 15000 });
  await visible(page, 'desktop-save-button').click();
  await visible(page, 'confirm-start-pelada-button').click();
  await expect(page).toHaveURL(/\/peladas\/\d+\/matches/, { timeout: 20000 });
}

/**
 * Ends the current match. end-match-button opens a PrettyConfirmDialog
 * confirmed by pretty-confirm-button.
 */
export async function endCurrentMatch(page: Page) {
  await visible(page, 'end-match-button').click();
  await visible(page, 'pretty-confirm-button').click();
}

/**
 * After ending a match the MatchReportSummary dialog takes over the page.
 * Close it to continue interacting with the matches view.
 */
export async function closeMatchReportSummary(page: Page) {
  const closeBtn = visible(page, 'summary-close-button');
  await expect(closeBtn).toBeVisible({ timeout: 15000 });
  await closeBtn.click();
  await expect(closeBtn).toBeHidden({ timeout: 10000 });
}

/**
 * Closes the pelada. close-pelada-button opens a PrettyConfirmDialog
 * confirmed by pretty-confirm-button.
 */
export async function closePelada(page: Page) {
  await visible(page, 'close-pelada-button').click();
  await visible(page, 'pretty-confirm-button').click();
}

/**
 * Records one goal through the new goal sheet:
 * goal button → scorer step → assist step → SEM ASSISTÊNCIA.
 * The scorer must play for the chosen side.
 */
export async function scoreGoalWithoutAssist(
  page: Page,
  side: 'home' | 'away',
  scorerName: string,
) {
  await visible(page, `goal-button-${side}`).click();
  const scorerDialog = visible(page, 'goal-select-dialog');
  await expect(scorerDialog).toBeVisible({ timeout: 10000 });
  await scorerDialog
    .getByText(scorerName, { exact: false })
    .first()
    .click();
  const assistDialog = visible(page, 'assist-select-dialog');
  await expect(assistDialog).toBeVisible({ timeout: 10000 });
  await visible(page, 'without-assistance-option').click();
  await expect(scorerDialog).toBeHidden({ timeout: 10000 });
}

/** Rates the first player in the voting list and saves the votes. */
export async function submitVote(page: Page, stars: number) {
  const rating = page.getByTestId(/rating-\d+/).first();
  await rating.locator('label').nth(stars - 1).click();
  await visible(page, 'save-votes-button').click();
  await expect(
    page.getByText(/Votes saved successfully|Votos registrados com sucesso/i),
  ).toBeVisible();
}

/**
 * Helper to accept a pending invitation on the home page.
 */
export async function acceptPendingInvitation(page: Page, orgName: string) {
  await page.goto('/');

  // The invitation may not exist yet right after first access, so retry with reloads.
  const inviteCard = page.getByTestId(`invitation-card-${orgName}`);
  await expect(async () => {
    if (!(await inviteCard.isVisible())) {
      await page.reload();
    }
    await expect(inviteCard).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 20000 });

  // Click the accept button for THIS specific organization
  await page.getByTestId(`accept-invitation-${orgName}`).click();

  // After accepting, the org must appear in the Member Organizations list.
  const orgLink = page.getByRole('link', { name: orgName });
  await expect(async () => {
    if (!(await orgLink.isVisible())) {
      await page.reload();
    }
    await expect(orgLink).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 20000 });

  await orgLink.click();
  await expect(page).toHaveURL(/\/organizations\/\d+/, { timeout: 15000 });
}
