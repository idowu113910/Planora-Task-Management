import { BrowserRouter, Routes, Route } from "react-router-dom";
import OnBoarding from "./pages/OnBoarding";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import Verify from "./pages/Verify";
import Home from "./pages/Home";
import Settings from "./pages/Setings";
import Project from "./pages/Project";
import Inbox from "./pages/Inbox";
import NotFound from "./pages/Error";
import Layout from "./layout/layout";
import ProtectedRoute from "./ProtectedRoute";

import "./App.css";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          {/* Anyone can open these. No footer on them. */}
          <Route path="/" element={<OnBoarding />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/verify" element={<Verify />} />

          {/* Only signed-in people can open these. Anyone else is sent to
              the sign in page. */}
          <Route element={<ProtectedRoute />}>
            {/* Footer shows on every page inside this group */}
            <Route element={<Layout />}>
              <Route path="/home" element={<Home />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/project" element={<Project />} />
              <Route path="/inbox" element={<Inbox />} />
            </Route>
          </Route>

          {/* Any other address shows the 404 page */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
