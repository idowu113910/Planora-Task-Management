import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true, // sends the httpOnly session cookies
});

let isRefreshing = false;
let queue = [];

// Endpoints that should never trigger a refresh attempt.
// /auth/me is intentionally NOT here: if its token expired, it should refresh
// and then retry automatically.
const SKIP_REFRESH = [
  "/auth/refresh",
  "/auth/login",
  "/auth/signup",
  "/auth/logout",
];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    const shouldSkip = SKIP_REFRESH.some((path) =>
      original?.url?.includes(path),
    );

    if (error.response?.status === 401 && !original._retry && !shouldSkip) {
      original._retry = true;

      // A refresh is already running: wait for it, then retry this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
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

// Auth endpoints, all resolved against baseURL (.../api)
export const authApi = {
  login: (credentials, config) => api.post("/auth/login", credentials, config), // POST
  signup: (data) => api.post("/auth/signup", data), // POST
  refresh: () => api.post("/auth/refresh"), // POST
  me: () => api.get("/auth/me"), // GET
  logout: () => api.post("/auth/logout"), // POST
};

export default api;
