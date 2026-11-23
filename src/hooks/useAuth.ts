import { useEffect, useState } from "react";
import { authApi } from "../api/client";

// Adjust these fields to match what your /auth/me endpoint returns
export type User = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      // If /me wraps the user (e.g. { user: {...} }), use res.data.user here
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
