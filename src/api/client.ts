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

// Finds the tokens in the backend's answer and saves them to localStorage
export const saveTokens = (responseData: unknown): boolean => {
  const body = asRecord(responseData);
  const data = asRecord(body?.data);
  const layers = [body, data, asRecord(body?.tokens), asRecord(data?.tokens)];

  const pick = (...keys: string[]): string | undefined => {
    for (const layer of layers) {
      if (!layer) continue;
      for (const key of keys) {
        const value = layer[key];
        if (typeof value === "string" && value) return value;
      }
    }
    return undefined;
  };

  const accessToken = pick("accessToken", "access_token", "token");
  const refreshToken = pick("refreshToken", "refresh_token");

  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);

  return Boolean(accessToken);
};

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
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
        if (!saveTokens(res.data)) {
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

export const authApi = {
  login: async (credentials: LoginPayload, config?: AxiosRequestConfig) => {
    const res = await api.post("/auth/login", credentials, config);
    saveTokens(res.data);
    return res;
  },
  signup: async (data: SignupPayload, config?: AxiosRequestConfig) => {
    const res = await api.post("/auth/signup", data, config);
    saveTokens(res.data);
    return res;
  },
  oauth: async (data: OAuthPayload, config?: AxiosRequestConfig) => {
    const res = await api.post("/auth/oauth", data, config);
    saveTokens(res.data);
    return res;
  },
  refresh: () =>
    api.post("/auth/refresh", {
      refreshToken: localStorage.getItem(REFRESH_KEY) ?? "",
    }),
  me: () => api.get("/auth/me"),
  logout: () => api.post("/auth/logout"),
};

export default api;
