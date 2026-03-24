import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { initRatingState, recordInstallAndMaybePrompt, checkDeferredPrompt, openReviewPage, _testing } from '../../rating';

const { KEY_INSTALL_COUNT, KEY_FIRST_ACTIVATION, KEY_DISMISSED, KEY_REMIND_AFTER, REVIEW_URL } = _testing;

function createMemento(): vscode.Memento {
  const store = new Map<string, unknown>();
  return {
    keys: () => [...store.keys()],
    get<T>(key: string, defaultValue?: T): T {
      return (store.has(key) ? store.get(key) : defaultValue) as T;
    },
    async update(key: string, value: unknown) {
      store.set(key, value);
    },
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

describe('rating', () => {
  let state: vscode.Memento;

  beforeEach(() => {
    state = createMemento();
    vi.mocked(vscode.window.showInformationMessage).mockReset();
    vi.mocked(vscode.env.openExternal).mockReset();
    _testing.resetInflight();
  });

  describe('initRatingState', () => {
    it('sets firstActivation on first call', () => {
      initRatingState(state);
      expect(state.get(KEY_FIRST_ACTIVATION)).toBeDefined();
    });

    it('does not overwrite firstActivation on second call', async () => {
      const early = '2025-01-01T00:00:00.000Z';
      await state.update(KEY_FIRST_ACTIVATION, early);
      initRatingState(state);
      expect(state.get(KEY_FIRST_ACTIVATION)).toBe(early);
    });
  });

  describe('recordInstallAndMaybePrompt', () => {
    it('increments install count', () => {
      recordInstallAndMaybePrompt(state, true);
      expect(state.get<number>(KEY_INSTALL_COUNT)).toBe(1);
      recordInstallAndMaybePrompt(state, true);
      expect(state.get<number>(KEY_INSTALL_COUNT)).toBe(2);
    });

    it('does not prompt below threshold', async () => {
      await state.update(KEY_FIRST_ACTIVATION, daysAgo(5));
      recordInstallAndMaybePrompt(state, true);
      recordInstallAndMaybePrompt(state, true);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('prompts when threshold reached and enough days elapsed', async () => {
      await state.update(KEY_FIRST_ACTIVATION, daysAgo(5));
      await state.update(KEY_INSTALL_COUNT, 2);
      recordInstallAndMaybePrompt(state, true);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Enjoying Skills.sh? A rating on the Marketplace helps others discover it.',
        'Rate \u2605\u2605\u2605\u2605\u2605',
        'Remind Me Later',
        'No Thanks',
      );
    });

    it('does not prompt if dismissed', async () => {
      await state.update(KEY_FIRST_ACTIVATION, daysAgo(5));
      await state.update(KEY_INSTALL_COUNT, 2);
      await state.update(KEY_DISMISSED, true);
      recordInstallAndMaybePrompt(state, true);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('does not prompt if fewer than 3 days since first activation', async () => {
      await state.update(KEY_FIRST_ACTIVATION, daysAgo(1));
      await state.update(KEY_INSTALL_COUNT, 2);
      recordInstallAndMaybePrompt(state, true);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('does not prompt when shouldNotify is false', async () => {
      await state.update(KEY_FIRST_ACTIVATION, daysAgo(5));
      await state.update(KEY_INSTALL_COUNT, 2);
      recordInstallAndMaybePrompt(state, false);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
  });

  describe('showPrompt actions', () => {
    beforeEach(async () => {
      await state.update(KEY_FIRST_ACTIVATION, daysAgo(5));
      await state.update(KEY_INSTALL_COUNT, 2);
    });

    it('"Rate" opens review URL and sets dismissed', async () => {
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce('Rate \u2605\u2605\u2605\u2605\u2605' as unknown as undefined);
      recordInstallAndMaybePrompt(state, true);
      await vi.waitFor(() => {
        expect(state.get<boolean>(KEY_DISMISSED)).toBe(true);
      });
      expect(vscode.env.openExternal).toHaveBeenCalledWith(vscode.Uri.parse(REVIEW_URL));
    });

    it('"Remind Me Later" sets future remind date', async () => {
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce('Remind Me Later' as unknown as undefined);
      recordInstallAndMaybePrompt(state, true);
      await vi.waitFor(() => {
        expect(state.get<string>(KEY_REMIND_AFTER)).toBeDefined();
      });
      const remindDate = new Date(state.get<string>(KEY_REMIND_AFTER)!);
      const now = new Date();
      const diffDays = (remindDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(13);
      expect(diffDays).toBeLessThan(15);
      expect(state.get<boolean>(KEY_DISMISSED)).toBeUndefined();
    });

    it('"No Thanks" sets dismissed', async () => {
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce('No Thanks' as unknown as undefined);
      recordInstallAndMaybePrompt(state, true);
      await vi.waitFor(() => {
        expect(state.get<boolean>(KEY_DISMISSED)).toBe(true);
      });
    });

    it('dismissing without clicking snoozes but does NOT set dismissed', async () => {
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(undefined);
      recordInstallAndMaybePrompt(state, true);
      // Wait for the async showPrompt to complete
      await vi.waitFor(() => {
        expect(_testing.resetInflight).toBeDefined(); // prompt resolved
      });
      // Give the promise chain time to settle
      await new Promise(r => setTimeout(r, 50));
      expect(state.get<boolean>(KEY_DISMISSED)).toBeUndefined();
      // Should set a snooze via remindAfter
      const remindAfter = state.get<string>(KEY_REMIND_AFTER);
      expect(remindAfter).toBeDefined();
      const snoozeDate = new Date(remindAfter!);
      const daysUntilSnooze = (snoozeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysUntilSnooze).toBeGreaterThan(6);
      expect(daysUntilSnooze).toBeLessThan(8);
    });
  });

  describe('checkDeferredPrompt', () => {
    it('fires prompt when remind date has passed', async () => {
      await state.update(KEY_FIRST_ACTIVATION, daysAgo(30));
      await state.update(KEY_INSTALL_COUNT, 5);
      await state.update(KEY_REMIND_AFTER, daysAgo(1));
      checkDeferredPrompt(state, true);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('does not fire prompt before remind date', async () => {
      await state.update(KEY_FIRST_ACTIVATION, daysAgo(30));
      await state.update(KEY_INSTALL_COUNT, 5);
      await state.update(KEY_REMIND_AFTER, daysFromNow(7));
      checkDeferredPrompt(state, true);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
  });

  describe('openReviewPage', () => {
    it('opens the marketplace review URL', () => {
      openReviewPage();
      expect(vscode.env.openExternal).toHaveBeenCalledWith(vscode.Uri.parse(REVIEW_URL));
    });
  });
});
