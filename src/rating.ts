import * as vscode from 'vscode';

const REVIEW_URL = 'https://marketplace.visualstudio.com/items?itemName=AbelMak.skills-sh&ssr=false#review-details';

const INSTALL_THRESHOLD = 3;
const MIN_DAYS_SINCE_FIRST_ACTIVATION = 3;
const REMIND_LATER_DAYS = 14;
const SNOOZE_DAYS = 7;  // silent dismiss (X button) snooze

const KEY_INSTALL_COUNT = 'skills-sh.rating.installCount';
const KEY_FIRST_ACTIVATION = 'skills-sh.rating.firstActivation';
const KEY_DISMISSED = 'skills-sh.rating.dismissed';
const KEY_REMIND_AFTER = 'skills-sh.rating.remindAfter';

let promptInFlight = false;

function shouldPrompt(state: vscode.Memento): boolean {
  if (state.get<boolean>(KEY_DISMISSED, false)) { return false; }

  const remindAfter = state.get<string>(KEY_REMIND_AFTER);
  if (remindAfter && new Date() < new Date(remindAfter)) { return false; }

  const installs = state.get<number>(KEY_INSTALL_COUNT, 0);
  if (installs < INSTALL_THRESHOLD) { return false; }

  const firstActivation = state.get<string>(KEY_FIRST_ACTIVATION);
  if (firstActivation) {
    const daysSince = (Date.now() - new Date(firstActivation).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < MIN_DAYS_SINCE_FIRST_ACTIVATION) { return false; }
  }

  return true;
}

async function showPrompt(state: vscode.Memento): Promise<void> {
  promptInFlight = true;
  try {
    const action = await vscode.window.showInformationMessage(
      'Enjoying Skills.sh? A rating on the Marketplace helps others discover it.',
      'Rate \u2605\u2605\u2605\u2605\u2605',
      'Remind Me Later',
      'No Thanks',
    );

    if (action === 'Rate \u2605\u2605\u2605\u2605\u2605') {
      openReviewPage();
      await state.update(KEY_DISMISSED, true);
    } else if (action === 'Remind Me Later') {
      const remindDate = new Date();
      remindDate.setDate(remindDate.getDate() + REMIND_LATER_DAYS);
      await state.update(KEY_REMIND_AFTER, remindDate.toISOString());
    } else if (action === 'No Thanks') {
      await state.update(KEY_DISMISSED, true);
    } else {
      // Dismissed without clicking (X / timeout) — snooze to avoid nagging
      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + SNOOZE_DAYS);
      await state.update(KEY_REMIND_AFTER, snoozeDate.toISOString());
    }
  } finally {
    promptInFlight = false;
  }
}

/** Record first activation timestamp (idempotent). */
export function initRatingState(state: vscode.Memento): void {
  if (!state.get<string>(KEY_FIRST_ACTIVATION)) {
    state.update(KEY_FIRST_ACTIVATION, new Date().toISOString());
  }
}

/** Increment install counter and prompt if thresholds are met. */
export function recordInstallAndMaybePrompt(state: vscode.Memento, notify: boolean): void {
  const count = state.get<number>(KEY_INSTALL_COUNT, 0) + 1;
  state.update(KEY_INSTALL_COUNT, count);

  if (notify && !promptInFlight && shouldPrompt(state)) {
    showPrompt(state);
  }
}

/** On activation, check if a deferred "Remind Later" prompt is now due. */
export function checkDeferredPrompt(state: vscode.Memento, notify: boolean): void {
  if (notify && !promptInFlight && shouldPrompt(state)) {
    showPrompt(state);
  }
}

/** Open the marketplace review page (command palette action). */
export function openReviewPage(): void {
  vscode.env.openExternal(vscode.Uri.parse(REVIEW_URL));
}

/** Reset all rating state (for testing / debugging). */
export async function resetRatingState(state: vscode.Memento): Promise<void> {
  await state.update(KEY_INSTALL_COUNT, undefined);
  await state.update(KEY_FIRST_ACTIVATION, undefined);
  await state.update(KEY_DISMISSED, undefined);
  await state.update(KEY_REMIND_AFTER, undefined);
  promptInFlight = false;
}

// Visible for testing
export const _testing = { KEY_INSTALL_COUNT, KEY_FIRST_ACTIVATION, KEY_DISMISSED, KEY_REMIND_AFTER, INSTALL_THRESHOLD, MIN_DAYS_SINCE_FIRST_ACTIVATION, REMIND_LATER_DAYS, SNOOZE_DAYS, REVIEW_URL, resetInflight: () => { promptInFlight = false; } };
