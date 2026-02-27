import { vi } from 'vitest';

interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export function mockFetch(responses: Record<string, MockResponse | (() => MockResponse)>) {
  const fetchFn = vi.fn(async (url: string | URL | Request): Promise<MockResponse> => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return typeof response === 'function' ? response() : response;
      }
    }
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}), text: async () => '' };
  });
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

export function jsonResponse(data: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

export function htmlResponse(html: string, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => ({}),
    text: async () => html,
  };
}

export function errorResponse(status = 500, body = 'Internal Server Error'): MockResponse {
  return {
    ok: false,
    status,
    statusText: body,
    json: async () => ({ error: body }),
    text: async () => body,
  };
}
