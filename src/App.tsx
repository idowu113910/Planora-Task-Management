import { BrowserRouter, Routes, Route } from "react-router-dom";
import OnBoarding from "./pages/OnBoarding";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import Home from "./pages/Home";
import Settings from "./pages/Setings";
import Project from "./pages/Project";
import Inbox from "./pages/Inbox";
import Layout from "./layout/layout";

import "./App.css";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          {/* No footer on these */}
          <Route path="/" element={<OnBoarding />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/signin" element={<SignIn />} />

          {/* Footer shows on every page inside this group */}
          <Route element={<Layout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/project" element={<Project />} />
            <Route path="/inbox" element={<Inbox />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
