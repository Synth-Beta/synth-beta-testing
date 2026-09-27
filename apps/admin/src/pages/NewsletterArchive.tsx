import { Helmet } from "react-helmet-async";
import { MarketingNavbar } from "@/components/marketing/MarketingNavbar";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { NewsletterSignupForm } from "@/components/marketing/NewsletterSignupForm";

export default function NewsletterArchive() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <Helmet>
        <title>The Synth Setlist | Synth Newsletter</title>
        <meta
          name="description"
          content="The Synth Setlist is a weekly newsletter for live music fans featuring show recommendations, artist spotlights, and product updates from Synth."
        />
        <link rel="canonical" href="https://getsynth.app/newsletter" />
        <meta property="og:title" content="The Synth Setlist | Synth Newsletter" />
        <meta
          property="og:description"
          content="Get weekly stories from the world of live music with The Synth Setlist."
        />
        <meta property="og:url" content="https://getsynth.app/newsletter" />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] bg-pink-500/15 rounded-[50%_50%_60%_40%] blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-24 w-[30rem] h-[30rem] bg-pink-400/12 rounded-[60%_40%_50%_50%] blur-3xl animate-pulse delay-300" />
      </div>

      <main>
        <MarketingNavbar activeItem="newsletter" />

        <section className="relative z-10 px-6 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 font-display">
              The Synth Setlist
            </h1>
            <p className="text-lg sm:text-xl text-gray-700 max-w-2xl mx-auto leading-relaxed mb-4">
              Weekly stories from the world of live music.
            </p>
            <p className="text-base sm:text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Discover standout shows, artists to watch, and the live moments people will be talking
              about next.
            </p>
          </div>
        </section>

        <section className="relative z-10 px-6 pb-24" aria-labelledby="newsletter-landing-heading">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="glass-card p-8 md:p-10 border-pink-200/30">
              <h2
                id="newsletter-landing-heading"
                className="text-2xl md:text-3xl font-bold text-gray-900 font-display text-center mb-3"
              >
                Subscribe to The Synth Setlist
              </h2>
              <p className="text-gray-700 text-center mb-8 max-w-2xl mx-auto">
                Get the newsletter in your inbox with fresh live-music stories and curated picks.
              </p>
              <NewsletterSignupForm />
            </div>

            <div className="glass-card p-8 md:p-10 border-pink-200/30">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 font-display text-center mb-8">
                What you'll get
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <article className="bg-white/90 rounded-2xl border border-pink-100/60 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2 font-display">Weekly stories</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Big live-music news and standout moments, filtered for busy fans.
                  </p>
                </article>
                <article className="bg-white/90 rounded-2xl border border-pink-100/60 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2 font-display">Show highlights</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Curated event picks, artist spotlights, and local scenes worth your attention.
                  </p>
                </article>
                <article className="bg-white/90 rounded-2xl border border-pink-100/60 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2 font-display">Synth updates</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Product updates designed to help you discover, track, and relive your best shows.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <MarketingFooter activeItem="newsletter" />
      </main>
    </div>
  );
}

