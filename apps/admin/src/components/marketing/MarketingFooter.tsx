import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095";

interface MarketingFooterProps {
  activeItem?: "media" | "newsletter";
}

export function MarketingFooter({ activeItem }: MarketingFooterProps) {
  const navLinkClass = "hover:text-pink-600 transition-colors";
  const activeClass = "text-pink-600 font-semibold";

  return (
    <footer className="relative z-10 px-6 py-12 border-t border-pink-200/30" aria-label="Site footer">
      <div className="max-w-7xl mx-auto text-center">
        <Link
          to="/"
          className="inline-flex items-center justify-center space-x-2 mb-6 text-gray-900 hover:opacity-90"
        >
          <img src="/Logos/Main logo black background.png" alt="Synth Logo" className="h-8 w-8" />
          <span className="text-xl font-bold bg-gradient-to-r from-pink-500 to-pink-700 bg-clip-text text-transparent">
            Synth
          </span>
        </Link>

        <p className="text-gray-600 mb-6">
          Connecting music lovers through safe, fun, and friendly concert experiences
        </p>

        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-pink-600 hover:text-pink-700 font-medium mb-6"
        >
          Download on the App Store
          <ExternalLink className="w-4 h-4 ml-1" />
        </a>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-gray-600">
          <Link to="/" className={navLinkClass}>
            Home
          </Link>
          <Link to="/pr" className={activeItem === "media" ? activeClass : navLinkClass}>
            Media
          </Link>
          <Link to="/newsletter" className={activeItem === "newsletter" ? activeClass : navLinkClass}>
            Newsletter
          </Link>
          <a href="#" className={navLinkClass}>
            Privacy Policy
          </a>
          <a href="#" className={navLinkClass}>
            Terms of Service
          </a>
        </div>
      </div>
    </footer>
  );
}

