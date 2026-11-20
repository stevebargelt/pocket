// Minimal jsdom environment for UI tests under node:test + tsx.
//
// Import this FIRST in a UI test file (before react-dom or Testing Library), so
// the DOM globals exist when those modules load. It also provides a fetch mock
// that records every call; tests must never reach a real server.

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;

/** Copy a jsdom window property onto Node's global, overriding Node's own (e.g. navigator). */
function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

setGlobal("window", window);
setGlobal("document", window.document);
setGlobal("navigator", window.navigator);
setGlobal("localStorage", window.localStorage);
for (const name of Object.getOwnPropertyNames(window)) {
  // DOM constructors and helpers (HTMLElement, KeyboardEvent, getComputedStyle, …)
  // that Node lacks. Never replace Node's own globals such as fetch or crypto.
  if (name in globalThis) continue;
  setGlobal(name, (window as unknown as Record<string, unknown>)[name]);
}

// Tell React 18 this is a test environment so act() works without warnings.
setGlobal("IS_REACT_ACT_ENVIRONMENT", true);

export interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

export type Routes = Record<string, unknown | ((call: FetchCall) => unknown)>;

/**
 * Replace global fetch with a mock answering `routes`, keyed by "METHOD /path"
 * (query strings ignored). Unknown routes answer 404. Returns the call log.
 */
export function mockFetch(routes: Routes): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const call = { url, method, body };
    calls.push(call);
    const key = `${method} ${url.split("?")[0]}`;
    if (!(key in routes)) return new Response("not found", { status: 404 });
    const route = routes[key];
    const payload = typeof route === "function" ? (route as (c: FetchCall) => unknown)(call) : route;
    return new Response(JSON.stringify(payload), {
      status: method === "POST" ? 201 : 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}
