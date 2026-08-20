import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { MarketingNavbar } from "@/components/marketing/MarketingNavbar";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { NewsletterSignupForm } from "@/components/marketing/NewsletterSignupForm";
import { getNewslettersNewestFirst } from "@/lib/newsletterStore";

const formatPublishDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export default function NewsletterArchive() {
  const sampleIssue = useMemo(
    () => getNewslettersNewestFirst().find((issue) => issue.isPublicSample) ?? getNewslettersNewestFirst()[0],
    []
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Helmet>
        <title>The Synth Setlist | Synth Newsletter</title>
        <meta
          name="description"
          content="The Synth Setlist is a weekly newsletter for live music fans featuring show recommendations, artist spotlights, and product updates from Synth."
        />
        <link rel="canonical" href="https://synth.app/newsletter" />
        <meta property="og:title" content="The Synth Setlist | Synth Newsletter" />
        <meta
          property="og:description"
          content="Get weekly stories from the world of live music with The Synth Setlist."
        />
        <meta property="og:url" content="https://synth.app/newsletter" />
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

            {sampleIssue && (
              <div className="glass-card border-pink-200/30 overflow-hidden group transition-all duration-300 hover:shadow-2xl hover:shadow-pink-500/20">
                <div className="p-3 border-b border-pink-100/70 bg-pink-50/50">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase text-pink-700 bg-pink-100">
                    Public Sample Issue
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
                  <img
                    src={sampleIssue.coverImage}
                    alt={`${sampleIssue.title} cover`}
                    className="w-full h-full object-cover bg-pink-50 min-h-[220px]"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="p-6 md:p-8">
                    <p className="text-sm text-gray-500 mb-2">
                      {formatPublishDate(sampleIssue.publishDate)}
                    </p>
                    <h3 className="text-2xl font-bold text-gray-900 mb-3 font-display">
                      {sampleIssue.title}
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-6">{sampleIssue.description}</p>
                    <Link
                      to={`/newsletter/${sampleIssue.slug}`}
                      className="inline-flex items-center gap-2 text-pink-600 font-semibold hover:text-pink-700"
                    >
                      View sample issue
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <MarketingFooter activeItem="newsletter" />
      </main>
    </div>
  );
}

