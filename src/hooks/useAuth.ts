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
    if (!localStorage.getItem("accessToken")) {
      setUser(null);
      setLoading(false);
      return;
    }

    authApi
      .me()
      .then((res) => setUser(res.data?.user ?? res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
