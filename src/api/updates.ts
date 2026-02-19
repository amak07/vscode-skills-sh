import { UpdateCheckRequest, UpdateCheckResponse } from '../types';

const CHECK_UPDATES_URL = 'https://add-skill.vercel.sh/check-updates';

let lastUpdateResult: UpdateCheckResponse | null = null;

export function getLastUpdateResult(): UpdateCheckResponse | null {
  return lastUpdateResult;
}

/** Remove a skill from the cached update result (e.g. after it was updated) */
export function clearUpdateForSkill(skillName: string): void {
  if (!lastUpdateResult) { return; }
  lastUpdateResult = {
    ...lastUpdateResult,
    updates: lastUpdateResult.updates.filter(u => u.name !== skillName),
  };
}

export async function checkUpdates(
  skills: UpdateCheckRequest['skills'],
  forceRefresh: boolean = false
): Promise<UpdateCheckResponse> {
  const body: UpdateCheckRequest = { skills, forceRefresh };

  const response = await fetch(CHECK_UPDATES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Check updates API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as UpdateCheckResponse;
  lastUpdateResult = data;
  return data;
}
