import { Navigate, Outlet } from "react-router-dom";
// @ts-expect-error The JavaScript auth hook does not currently have TypeScript declarations.
import { useAuth } from "./hooks/useAuth.js";

const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return null; // or a spinner while /auth/me is in flight

  return user ? <Outlet /> : <Navigate to="/signin" replace />;
};

export default ProtectedRoute;
