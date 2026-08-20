import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/MarketingNavbar";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getNewsletterBySlugRuntime, getNewslettersNewestFirst } from "@/lib/newsletterStore";
import { renderNewsletterHtml } from "@/lib/newsletterRenderer";

const formatPublishDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export default function NewsletterDetail() {
  const { slug } = useParams<{ slug: string }>();
  const newslettersNewestFirst = useMemo(() => getNewslettersNewestFirst(), []);
  const newsletter = slug ? getNewsletterBySlugRuntime(slug) : undefined;

  const newsletterIndex = useMemo(() => {
    if (!newsletter) return -1;
    return newslettersNewestFirst.findIndex((entry) => entry.slug === newsletter.slug);
  }, [newsletter, newslettersNewestFirst]);

  const renderedIssueHtml = useMemo(() => {
    if (!newsletter) return "";
    return renderNewsletterHtml(newsletter, { mode: "web" });
  }, [newsletter]);

  const previousNewsletter =
    newsletterIndex >= 0 && newsletterIndex < newslettersNewestFirst.length - 1
      ? newslettersNewestFirst[newsletterIndex + 1]
      : null;

  const nextNewsletter =
    newsletterIndex > 0 ? newslettersNewestFirst[newsletterIndex - 1] : null;

  if (!newsletter) {
    return <Navigate to="/newsletter" replace />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Helmet>
        <title>{newsletter.title} | The Synth Setlist</title>
        <meta name="description" content={newsletter.description} />
        <link rel="canonical" href={`https://synth.app/newsletter/${newsletter.slug}`} />
        <meta property="og:title" content={`${newsletter.title} | The Synth Setlist`} />
        <meta property="og:description" content={newsletter.description} />
        <meta property="og:url" content={`https://synth.app/newsletter/${newsletter.slug}`} />
        <meta property="og:type" content="article" />
      </Helmet>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] bg-pink-500/15 rounded-[50%_50%_60%_40%] blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-24 w-[30rem] h-[30rem] bg-pink-400/12 rounded-[60%_40%_50%_50%] blur-3xl animate-pulse delay-300" />
      </div>

      <main>
        <MarketingNavbar activeItem="newsletter" />

        <section className="relative z-10 px-0 py-10 md:py-12">
          <div className="w-full">
            <nav aria-label="Breadcrumb" className="text-sm text-gray-600 mb-4">
              <ol className="flex flex-wrap items-center gap-2 px-6">
                <li>
                  <Link to="/" className="hover:text-pink-600 transition-colors">
                    Home
                  </Link>
                </li>
                <li>/</li>
                <li>
                  <Link to="/newsletter" className="hover:text-pink-600 transition-colors">
                    Newsletter
                  </Link>
                </li>
                <li>/</li>
                <li className="text-gray-900 font-medium">{newsletter.title}</li>
              </ol>
            </nav>

            <header className="mb-6 px-6">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 font-display">
                {newsletter.title}
              </h1>
              <p className="text-gray-600">{formatPublishDate(newsletter.publishDate)}</p>
            </header>

            <article className="overflow-hidden">
              <div
                className="newsletter-document overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: renderedIssueHtml }}
              />
            </article>

            <section
              className="mt-10 px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
              aria-label="Newsletter pagination"
            >
              <div>
                {previousNewsletter ? (
                  <Link
                    to={`/newsletter/${previousNewsletter.slug}`}
                    className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 font-semibold"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous Newsletter
                  </Link>
                ) : (
                  <span className="text-gray-400">No previous newsletter</span>
                )}
              </div>

              <div>
                {nextNewsletter ? (
                  <Link
                    to={`/newsletter/${nextNewsletter.slug}`}
                    className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 font-semibold"
                  >
                    Next Newsletter
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="text-gray-400">No next newsletter</span>
                )}
              </div>
            </section>
          </div>
        </section>

        <MarketingFooter activeItem="newsletter" />
      </main>
    </div>
  );
}

