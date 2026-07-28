import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, ExternalLink, Rss } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

const APP_STORE_URL = 'https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095';
const NEWS_CACHE_KEY = 'media_news_feed_cache_v1';
const NEWS_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

interface NewsItem {
  id: string;
  title: string;
  url: string;
  image_url: string | null;
  source: string | null;
  sort_order: number;
  created_at: string;
  image_alt?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  primary_keyword?: string | null;
  keywords?: string[] | null;
}

export default function Media() {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasCachedData, setHasCachedData] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const hydrateFromCache = () => {
      if (typeof window === 'undefined') return false;
      try {
        const cachedRaw = window.sessionStorage.getItem(NEWS_CACHE_KEY);
        if (!cachedRaw) return false;
        const cached = JSON.parse(cachedRaw) as { timestamp: number; items: NewsItem[] };
        if (!cached?.items || !Array.isArray(cached.items)) {
          window.sessionStorage.removeItem(NEWS_CACHE_KEY);
          return false;
        }
        const isFresh = Date.now() - cached.timestamp < NEWS_CACHE_TTL;
        if (isFresh) {
          setNewsItems(cached.items);
          setHasCachedData(true);
          setLoading(false);
          return true;
        }
        return false;
      } catch (err) {
        console.warn('Failed to parse cached news feed', err);
        window.sessionStorage.removeItem(NEWS_CACHE_KEY);
        return false;
      }
    };

    const fetchNews = async (skipLoader = false) => {
      if (!skipLoader) {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from('news_items')
        .select('id, title, url, image_url, source, sort_order, created_at, image_alt')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(50);

      if (!isMounted) return;

      if (error) {
        console.error('Error fetching news items:', error);
      } else {
        setNewsItems(data ?? []);
        setHasCachedData(false);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(
            NEWS_CACHE_KEY,
            JSON.stringify({ timestamp: Date.now(), items: data ?? [] })
          );
        }
      }

      setLoading(false);
    };

    const hadFreshCache = hydrateFromCache();
    fetchNews(hadFreshCache);

    return () => {
      isMounted = false;
    };
  }, []);

  const openAppStore = () => {
    window.open(APP_STORE_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Helmet>
        <title>Media & Press | Synth - Live Music Discovery & Concert Tracking App</title>
        <meta
          name="description"
          content="Discover Synth in the press: live music discovery, concert tracking, and the app for finding shows near you. Read stories, Substack, and updates — then try Synth."
        />
        <link rel="canonical" href="https://synth.app/pr" />
        <meta property="og:title" content="Media & Press | Synth - Live Music Discovery & Concert Tracking" />
        <meta
          property="og:description"
          content="Stories, press, and updates about Synth — the live music discovery and concert tracking app. Discover shows, track what you've seen, see what friends are attending."
        />
        <meta property="og:url" content="https://synth.app/pr" />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] bg-pink-500/15 rounded-[50%_50%_60%_40%] blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-24 w-[30rem] h-[30rem] bg-pink-400/12 rounded-[60%_40%_50%_50%] blur-3xl animate-pulse delay-300" />
      </div>

      <main>
        {/* Navigation */}
        <nav className="relative z-10 p-6 glass-header" aria-label="Main navigation">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link
              to="/"
              className="flex items-center space-x-2 text-gray-900 hover:opacity-90 transition-opacity"
              aria-label="Synth home"
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
              <Link
                to="/#about"
                className="text-gray-700 hover:text-pink-600 transition-colors font-medium"
              >
                About
              </Link>
              <span className="text-pink-600 font-semibold">Media</span>
              <Button
                onClick={openAppStore}
                className="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white border-0 shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 transition-all duration-300 rounded-full"
              >
                Download
              </Button>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="relative z-10 px-6 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 font-display">
              Media &amp; Press
            </h1>
            <p className="text-lg sm:text-xl text-gray-700 max-w-2xl mx-auto leading-relaxed">
              Stories, press, and updates about Synth — the live music discovery and concert tracking app. Discover upcoming concerts, track shows you&apos;ve attended, and see what your friends are going to.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 mt-8 text-pink-600 hover:text-pink-700 font-semibold"
            >
              Discover Synth
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Unified feed - all press, stories, Substack, etc. in one list */}
        <section className="relative z-10 px-6 py-12 pb-24" aria-labelledby="media-feed">
          <div className="max-w-4xl mx-auto">
            <article className="glass-card p-8 border-pink-200/30">
              <div className="flex items-center gap-3 mb-6">
                <Rss className="h-8 w-8 text-pink-600" aria-hidden />
                <h2 id="media-feed" className="text-2xl font-bold text-gray-900 font-display">
                  Feed
                </h2>
              </div>
              <p className="text-gray-700 mb-8">
                Coverage, stories, and updates about Synth — live music discovery, concert tracking, and the best app for finding concerts near you.
              </p>
              {loading && !hasCachedData ? (
                <div className="space-y-4" aria-live="polite" aria-busy="true">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="flex items-start gap-4 p-3 -mx-3">
                      <Skeleton className="w-16 h-16 rounded-md" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : newsItems.length === 0 ? (
                <p className="text-gray-500 italic">More soon.</p>
              ) : (
                <ul className="space-y-4">
                  {newsItems.map((item) => (
                    <li key={item.id}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-4 group text-gray-800 hover:text-pink-600 transition-colors p-3 -mx-3 rounded-lg hover:bg-pink-50/50"
                      >
                        {item.image_url && (
                          <img
                            src={item.image_url}
                            alt={item.image_alt || item.title}
                            className="w-16 h-16 rounded object-cover shrink-0"
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="font-medium group-hover:underline block">{item.title}</span>
                          {item.source && (
                            <span className="text-gray-500 text-sm">{item.source}</span>
                          )}
                        </span>
                        <ExternalLink className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 px-6 py-12">
          <div className="max-w-2xl mx-auto text-center glass-card p-8 border-pink-200/40">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 font-display">
              Try the live music discovery app
            </h2>
            <p className="text-gray-700 mb-6">
              Discover upcoming concerts, track what you&apos;ve seen, and see what friends are attending — all in one place.
            </p>
            <Button
              onClick={openAppStore}
              className="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white px-8 py-4 shadow-lg shadow-pink-500/30 rounded-full"
            >
              Download on the App Store
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative z-10 px-6 py-12 border-t border-pink-200/30" aria-label="Site footer">
          <div className="max-w-7xl mx-auto text-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center space-x-2 mb-6 text-gray-900 hover:opacity-90"
            >
              <img
                src="/Logos/Main logo black background.png"
                alt="Synth Logo"
                className="h-8 w-8"
              />
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
              <Link to="/" className="hover:text-pink-600 transition-colors">
                Home
              </Link>
              <Link to="/pr" className="hover:text-pink-600 transition-colors">
                Media
              </Link>
              <a href="#" className="hover:text-pink-600 transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-pink-600 transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
