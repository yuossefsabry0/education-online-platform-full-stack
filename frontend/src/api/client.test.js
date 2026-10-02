import { describe, expect, it, beforeEach } from "vitest";
import api, {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  isSafeFileUrl,
  setSession,
  toApiError,
  updateAccessToken,
} from "./client.js";

beforeEach(() => {
  clearSession();
  localStorage.clear();
});

describe("memory-only session", () => {
  it("keeps the access token out of web storage", () => {
    setSession({ token: "abc", user: { userType: "student", id: 1 } });
    expect(getAccessToken()).toBe("abc");
    expect(localStorage.getItem("edu.accessToken")).toBeNull();
    expect(localStorage.getItem("edu.refreshToken")).toBeNull();
    expect(getStoredUser()).toMatchObject({ userType: "student" });
  });

  it("never persists a refresh token", () => {
    setSession({ token: "abc", refreshToken: "should-be-ignored", user: { userType: "student" } });
    expect(getRefreshToken()).toBeNull();
    expect(localStorage.getItem("edu.refreshToken")).toBeNull();
  });

  it("updates and clears the in-memory token", () => {
    updateAccessToken("next");
    expect(getAccessToken()).toBe("next");
    clearSession();
    expect(getAccessToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it("sends cookies with every request", () => {
    expect(api.defaults.withCredentials).toBe(true);
  });
});

describe("safe file urls", () => {
  it("allows http(s) attachments", () => {
    expect(isSafeFileUrl("https://media.example.com/a.mp4")).toBe(true);
    expect(isSafeFileUrl("http://media.example.com/a.mp4")).toBe(true);
  });

  it("blocks executable schemes and other values", () => {
    expect(isSafeFileUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeFileUrl("   JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeFileUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeFileUrl("/relative/path.mp4")).toBe(false);
    expect(isSafeFileUrl(null)).toBe(false);
  });
});

describe("api errors", () => {
  it("normalizes backend failures", () => {
    const err = {
      response: {
        status: 409,
        data: { error: { code: "ACTIVE_SUBSCRIPTION_EXISTS", message: "Taken", details: null } },
      },
    };
    expect(toApiError(err)).toMatchObject({ status: 409, code: "ACTIVE_SUBSCRIPTION_EXISTS" });
  });
});
