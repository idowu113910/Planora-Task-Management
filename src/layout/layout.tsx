import { Outlet } from "react-router-dom";
import Footer from "./Footer";

// Wraps every page that should show the footer.
// <Outlet /> is where the current page (Home, Inbox, ...) is drawn.
const Layout = () => {
  return (
    // pb-28 keeps the bottom of each page from hiding behind the fixed footer
    <div className="bg-[#F1F4F8] pb-28">
      <Outlet />
      <Footer />
    </div>
  );
};

export default Layout;
