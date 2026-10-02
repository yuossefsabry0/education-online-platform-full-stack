import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { clearSession, endpoints, setSession } from "./client.js";

function okResponse(payload, config) {
  return {
    data: { success: true, data: payload, error: null },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  };
}

function authOf(config) {
  const h = (config && config.headers) || {};
  if (h.get) return h.get("Authorization") || h.get("authorization");
  return h.Authorization || h.authorization;
}

function fail401(config) {
  const err = new Error("unauthorized");
  err.config = { ...(config || {}) };
  if (config && config.headers) err.config.headers = config.headers;
  err.response = {
    status: 401,
    data: { success: false, data: null, error: { code: "UNAUTHORIZED", message: "Auth", details: null } },
  };
  return err;
}

describe("refresh interceptor", () => {
  let refreshCalls;
  let protectedCalls;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    clearSession();
    localStorage.clear();
    vi.restoreAllMocks();
    refreshCalls = 0;
    protectedCalls = 0;
    axios.defaults.adapter = async (config) => {
      const url = String(config.url || "");
      if (url.includes("/auth/refresh") || url.includes("/auth/logout")) {
        refreshCalls += 1;
        return okResponse({ token: "new-token", user: { userType: "student", id: 1 } }, config);
      }
      if (url.includes("/auth/login")) {
        throw fail401(config);
      }
      if (authOf(config) === "Bearer new-token") {
        protectedCalls += 1;
        return okResponse({ ok: 1 }, config);
      }
      throw fail401(config);
    };
    api.defaults.adapter = axios.defaults.adapter;
    vi.spyOn(window, "dispatchEvent");
  });

  it("retries once with a single shared refresh for concurrent 401s", async () => {
    setSession({ token: "expired", user: { userType: "student", id: 1 } });
    const [a, b] = await Promise.all([endpoints.me(), endpoints.me()]);
    expect(a).toEqual({ ok: 1 });
    expect(b).toEqual({ ok: 1 });
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
    expect(api.defaults.withCredentials).toBe(true);
  });

  it("never retries auth endpoints", async () => {
    await expect(endpoints.login({ username: "u", password: "p" })).rejects.toBeTruthy();
    expect(refreshCalls).toBe(0);
  });

  it("clears the session and notifies on refresh failure", async () => {
    axios.defaults.adapter = async (config) => {
      throw fail401(config);
    };
    setSession({ token: "expired", user: { userType: "student", id: 1 } });
    await expect(endpoints.me()).rejects.toBeTruthy();
    expect(localStorage.getItem("edu.user")).toBeNull();
    const names = window.dispatchEvent.mock.calls.map((c) => String(c[0] && c[0].type));
    expect(names).toContain("edu:session-expired");
  });
});
