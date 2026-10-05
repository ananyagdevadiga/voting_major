import { Link, NavLink } from "react-router-dom";
import { Lock, Vote } from "lucide-react";

const WIDTHS = {
  narrow: "max-w-[30rem]",
  medium: "max-w-xl",
  wide: "max-w-3xl",
};

/*
 * Page shell shared by every screen: header, centered content column, footer.
 * `fit` locks the page to the viewport height (no scrolling, no footer) for the home page.
 */
function Layout({ children, width = "narrow", fit = false }) {
  if (fit) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <Header />
        <main className="mx-auto min-h-0 w-full max-w-6xl flex-1 px-5 py-6 lg:py-10">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className={`mx-auto w-full flex-1 px-5 py-10 sm:py-14 ${WIDTHS[width]}`}>{children}</main>

      <footer className="py-8">
        <p className="flex items-center justify-center gap-1.5 text-sm text-slate-500">
          <Lock size={14} aria-hidden="true" />
          Your credential never leaves this device
        </p>
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Vote size={18} aria-hidden="true" />
          </span>
          <span className="font-semibold tracking-tight">SecureVote</span>
        </Link>
        <NavLink
          to="/results"
          className={({ isActive }) =>
            `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
        >
          Results
        </NavLink>
      </div>
    </header>
  );
}

export default Layout;
