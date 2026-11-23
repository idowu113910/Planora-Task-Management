import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";

const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return null; // or a spinner while /auth/me is in flight

  return user ? <Outlet /> : <Navigate to="/signin" replace />;
};

export default ProtectedRoute;
