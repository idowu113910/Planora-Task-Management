import axios from "axios";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "") as string;

// Where the tokens are kept in the browser
const ACCESS_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true,
});

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

// Looks for a text value under one of the given names, in the answer and in any
// objects inside it (up to 4 levels down), so it doesn't matter how the backend
// wraps its answer: { accessToken }, { data: { tokens: { accessToken } } } ...
const findString = (
  value: unknown,
  keys: string[],
  depth = 0,
): string | undefined => {
  const record = asRecord(value);
  if (!record || depth > 4) return undefined;

  for (const key of keys) {
    const found = record[key];
    if (typeof found === "string" && found) return found;
  }
  for (const inner of Object.values(record)) {
    const found = findString(inner, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
};

// Reads one response header, whatever the case it was sent in
const readHeader = (headers: unknown, name: string): string | undefined => {
  const source = headers as { get?: (header: string) => unknown } | undefined;
  const value =
    typeof source?.get === "function"
      ? source.get(name)
      : asRecord(headers)?.[name];
  return typeof value === "string" && value ? value : undefined;
};

// Finds the tokens in the backend's answer (the body, or the headers) and saves
// them to localStorage. Returns true if an access token was found.
export const saveTokens = (
  responseData: unknown,
  responseHeaders?: unknown,
): boolean => {
  const accessToken =
    findString(responseData, ["accessToken", "access_token"]) ??
    findString(responseData, ["token", "jwt"]) ??
    readHeader(responseHeaders, "authorization")?.replace(/^Bearer\s+/i, "") ??
    readHeader(responseHeaders, "x-access-token");

  const refreshToken =
    findString(responseData, ["refreshToken", "refresh_token"]) ??
    readHeader(responseHeaders, "x-refresh-token");

  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);

  return Boolean(accessToken);
};

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

// Runs after a successful login or sign-up. If no token came back, the app has
// to rely on the backend's cookies, and /auth/me will answer 401 when those
// cookies don't reach this site. This note says so in the browser console while
// you are building (it never shows in the live site).
const noteIfNoToken = (found: boolean, what: string) => {
  if (!found && import.meta.env.DEV) {
    console.warn(
      `[auth] ${what} worked, but no token was found in the answer. If /auth/me then fails with 401, check the ${what} response in the Network tab.`,
    );
  }
};

// 1. ATTACH ACCESS TOKEN: Ensures /auth/me and all authenticated routes
// always send the Bearer token in the header.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

type QueueItem = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let queue: QueueItem[] = [];

const SKIP_REFRESH = [
  "/auth/refresh",
  "/auth/login",
  "/auth/signup",
  "/auth/oauth",
  "/auth/logout",
];

api.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const original = error.config as RetryableConfig;
    const shouldSkip = SKIP_REFRESH.some((path) =>
      original.url?.includes(path),
    );

    const hasRefreshToken = Boolean(localStorage.getItem(REFRESH_KEY));

    if (
      error.response?.status === 401 &&
      !original._retry &&
      !shouldSkip &&
      hasRefreshToken
    ) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then(() => api(original));
      }

      isRefreshing = true;
      try {
        const res = await authApi.refresh();
        if (!saveTokens(res.data, res.headers)) {
          throw new Error("The refresh answer had no access token");
        }

        isRefreshing = false;
        const currentQueue = [...queue];
        queue = [];
        currentQueue.forEach((p) => p.resolve());
        return api(original);
      } catch (err) {
        isRefreshing = false;
        const currentQueue = [...queue];
        queue = [];
        currentQueue.forEach((p) => p.reject(err));
        clearTokens();
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  },
);

export type LoginPayload = {
  email: string;
  password: string;
};

export type SignupPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type OAuthPayload = {
  provider: "google" | "apple";
  token: string;
  user?: unknown;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// "The server isn't ready yet", as opposed to "you are signed out". Render's
// free plan sleeps, and while it wakes up the host answers 502, 503 or 504, or
// the request times out or fails to connect. Only a 401 means "not signed in".
const isServerBusy = (error: unknown): boolean => {
  if (!axios.isAxiosError(error) || axios.isCancel(error)) return false;
  if (!error.response) return true;
  return [502, 503, 504].includes(error.response.status);
};

// How many times /auth/me is asked while the server is waking up, and how long
// to wait between tries (milliseconds)
const ME_RETRY_DELAYS = [1500, 3000, 6000];

export const authApi = {
  login: async (credentials: LoginPayload, config?: AxiosRequestConfig) => {
    const res = await api.post("/auth/login", credentials, config);
    noteIfNoToken(saveTokens(res.data, res.headers), "login");
    return res;
  },
  signup: async (data: SignupPayload, config?: AxiosRequestConfig) => {
    const res = await api.post("/auth/signup", data, config);
    noteIfNoToken(saveTokens(res.data, res.headers), "sign-up");
    return res;
  },
  oauth: async (data: OAuthPayload, config?: AxiosRequestConfig) => {
    const res = await api.post("/auth/oauth", data, config);
    noteIfNoToken(saveTokens(res.data, res.headers), "sign-in");
    return res;
  },
  refresh: () =>
    api.post("/auth/refresh", {
      refreshToken: localStorage.getItem(REFRESH_KEY) ?? "",
    }),

  // Asks who is signed in. If the server is only waking up (502, 503, 504, a
  // timeout), it tries again a few times instead of failing straight away, so
  // a slow server doesn't look like "signed out". A 401 still fails at once.
  me: async (config?: AxiosRequestConfig) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await api.get("/auth/me", config);
      } catch (error) {
        const delay = ME_RETRY_DELAYS[attempt];
        if (delay === undefined || !isServerBusy(error)) throw error;
        await sleep(delay);
      }
    }
  },

  // Always forgets the tokens in this browser, even if the server can't be
  // reached, so a signed-out person can't be let back in by an old token
  logout: async () => {
    try {
      return await api.post("/auth/logout");
    } finally {
      clearTokens();
    }
  },
};

export default api;
