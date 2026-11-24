import axios from "axios";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";

// If VITE_API_URL is set, requests go straight to that server.
// If it is empty, requests go to "/api" on the same site (the Vercel rewrite
// in vercel.json forwards them to the backend). Same-site requests are the
// most reliable way to keep login cookies working in Safari.
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "") as string;

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true, // sends the httpOnly session cookies
});

// A request config that remembers whether it was already retried once
type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// Requests that arrived while a refresh was already running
type QueueItem = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let queue: QueueItem[] = [];

// Endpoints that should never trigger a refresh attempt.
// /auth/me is intentionally NOT here: if its token expired, it should refresh
// and then retry automatically.
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
    // Not a normal HTTP error (or no request info): pass it along untouched
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const original = error.config as RetryableConfig;

    const shouldSkip = SKIP_REFRESH.some((path) =>
      original.url?.includes(path),
    );

    if (error.response?.status === 401 && !original._retry && !shouldSkip) {
      original._retry = true;

      // A refresh is already running: wait for it, then retry this request
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then(() => api(original));
      }

      isRefreshing = true;
      try {
        await authApi.refresh();
        queue.forEach((p) => p.resolve());
        return api(original);
      } catch (err) {
        queue.forEach((p) => p.reject(err));
        // No redirect here: ProtectedRoute sends the user to /signin when
        // /auth/me fails, so public pages keep working.
        return Promise.reject(err);
      } finally {
        queue = [];
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// What each endpoint expects
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

// Auth endpoints, all resolved against baseURL (.../api).
// The optional `config` argument lets callers pass axios options, such as a
// longer timeout for Render's cold start.
export const authApi = {
  login: (credentials: LoginPayload, config?: AxiosRequestConfig) =>
    api.post("/auth/login", credentials, config), // POST
  signup: (data: SignupPayload, config?: AxiosRequestConfig) =>
    api.post("/auth/signup", data, config), // POST
  oauth: (data: OAuthPayload, config?: AxiosRequestConfig) =>
    api.post("/auth/oauth", data, config), // POST (Google / Apple)
  refresh: () => api.post("/auth/refresh"), // POST
  me: () => api.get("/auth/me"), // GET
  logout: () => api.post("/auth/logout"), // POST
};

export default api;
