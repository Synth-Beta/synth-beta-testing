import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095";

interface MarketingNavbarProps {
  activeItem?: "media" | "newsletter";
}

export function MarketingNavbar({ activeItem }: MarketingNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const openAppStore = () => {
    window.open(APP_STORE_URL, "_blank", "noopener,noreferrer");
    closeMobileMenu();
  };

  const navLinkClass = "text-gray-700 hover:text-pink-600 transition-colors font-medium";
  const activeClass = "text-pink-600 font-semibold";

  return (
    <nav className="relative z-10 p-6 glass-header" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center space-x-2 text-gray-900 hover:opacity-90 transition-opacity"
          aria-label="Synth home"
          onClick={closeMobileMenu}
        >
          <img
            src="/Logos/Main logo black background.png"
            alt="Synth Logo"
            className="h-10 w-10"
            width={40}
            height={40}
          />
          <span className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-pink-700 bg-clip-text text-transparent">
            Synth
          </span>
        </Link>

        <div className="hidden md:flex items-center space-x-8">
          <Link to="/#about" className={navLinkClass}>
            About
          </Link>
          <Link to="/pr" className={activeItem === "media" ? activeClass : navLinkClass}>
            Media
          </Link>
          <Link
            to="/newsletter"
            className={activeItem === "newsletter" ? activeClass : navLinkClass}
          >
            Newsletter
          </Link>
          <Button
            onClick={openAppStore}
            className="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white border-0 shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 transition-all duration-300 rounded-full"
          >
            Download
          </Button>
        </div>

        <button
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="md:hidden text-gray-700 p-2"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-marketing-menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div id="mobile-marketing-menu" className="md:hidden mt-4 glass-card p-6">
          <div className="flex flex-col space-y-4">
            <Link to="/#about" onClick={closeMobileMenu} className={navLinkClass}>
              About
            </Link>
            <Link to="/pr" onClick={closeMobileMenu} className={navLinkClass}>
              Media
            </Link>
            <Link to="/newsletter" onClick={closeMobileMenu} className={navLinkClass}>
              Newsletter
            </Link>
            <Button
              onClick={openAppStore}
              className="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white border-0 shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 transition-all duration-300 w-full rounded-full"
            >
              Download
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}

