import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowRight,
  CheckCircle,
  Menu,
  X,
  ExternalLink
} from 'lucide-react';
import { EmailGateService } from '@/services/emailGateService';
import { useToast } from '@/hooks/use-toast';
import { JuicerEmbed } from '@/components/JuicerEmbed';

const APP_STORE_URL = 'https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095';
const SYNTH_WEB_BETA_URL = 'https://join.getsynth.app';

const DEMO_IMAGES = [
  { src: '/demos/Discover copy.png', alt: 'Discover' },
  { src: '/demos/Share copy.png', alt: 'Share' },
  { src: '/demos/Connect copy.PNG', alt: 'Connect' },
  { src: '/demos/Personalization copy.PNG', alt: 'Personalization' },
  { src: '/demos/Memories copy.PNG', alt: 'Memories' },
];

export const ModernLandingPage = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();

  const openAppStore = () => {
    window.open(APP_STORE_URL, '_blank', 'noopener,noreferrer');
  };

  const openWebBeta = () => {
    window.location.assign(SYNTH_WEB_BETA_URL);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const userIP = await EmailGateService.getUserIP();
      const success = await EmailGateService.submitEmail(email, userIP);

      if (success) {
        toast({
          title: "You're in!",
          description: "We'll keep you updated on new features and shows.",
        });
        setEmail('');
      } else {
        toast({
          title: 'Error',
          description: 'Something went wrong. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error submitting email:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToAbout = () => {
    document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Glassy White Marble Background - let body background show through */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Pink marble accent clouds */}
        <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] bg-pink-500/15 rounded-[50%_50%_60%_40%] blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-24 w-[30rem] h-[30rem] bg-pink-400/12 rounded-[60%_40%_50%_50%] blur-3xl animate-pulse delay-300"></div>
        <div className="absolute top-1/3 left-1/3 w-[22rem] h-[22rem] bg-pink-300/10 rounded-[40%_60%_50%_50%] blur-3xl animate-pulse delay-700"></div>
      </div>

      <main className="pb-32 md:pb-0">
      {/* Navigation */}
      <nav className="relative z-10 p-6 glass-header" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
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
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <button
              onClick={scrollToAbout}
              className="text-gray-700 hover:text-pink-600 transition-colors font-medium"
            >
              About
            </button>
            <Link
              to="/pr"
              className="text-gray-700 hover:text-pink-600 transition-colors font-medium"
            >
              Media
            </Link>
            <Button
              onClick={openWebBeta}
              variant="outline"
              className="border-pink-300 text-pink-700 hover:bg-pink-50 rounded-full"
            >
              Try Synth Now
            </Button>
            <Button
              onClick={openAppStore}
              className="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white border-0 shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 transition-all duration-300 rounded-full"
            >
              Download
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-700 p-2"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 glass-card p-6">
            <div className="flex flex-col space-y-4">
              <button
                onClick={() => {
                  scrollToAbout();
                  setMobileMenuOpen(false);
                }}
                className="text-gray-700 hover:text-pink-600 transition-colors text-left font-medium"
              >
                About
              </button>
              <Link
                to="/pr"
                onClick={() => setMobileMenuOpen(false)}
                className="text-gray-700 hover:text-pink-600 transition-colors font-medium"
              >
                Media
              </Link>
              <Button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openWebBeta();
                }}
                variant="outline"
                className="border-pink-300 text-pink-700 hover:bg-pink-50 w-full rounded-full"
              >
                Try Synth Now
              </Button>
              <Button
                onClick={() => {
                  openAppStore();
                  setMobileMenuOpen(false);
                }}
                className="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white border-0 shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 transition-all duration-300 w-full rounded-full"
              >
                Download
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-6 py-20">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-8">
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold mb-6 leading-tight font-display">
              <span className="bg-gradient-to-r from-pink-500 via-pink-600 to-pink-700 bg-clip-text text-transparent">
                Discover, Connect,
              </span>
              <br />
              <span className="text-gray-900">
                Share
              </span>
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed px-4">
              Going to shows just got easier. Find concerts, connect with peers, and share your live music experiences all in one place.
            </p>
          </div>

          {/* Primary CTAs — web beta + App Store */}
          <div className="mb-16 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={openWebBeta}
              className="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white px-8 py-4 text-lg font-semibold shadow-2xl shadow-pink-500/30 hover:shadow-pink-500/40 transition-all duration-300 transform hover:scale-105 rounded-full w-full sm:w-auto"
            >
              Try Synth Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              onClick={openAppStore}
              variant="outline"
              className="border-2 border-pink-400 text-pink-700 hover:bg-pink-50 px-8 py-4 text-lg font-semibold rounded-full w-full sm:w-auto"
            >
              Download on the App Store
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>

          {/* Hero Visual */}
          <div className="relative">
            <div className="w-32 h-32 mx-auto mb-8 relative">
              <img
                src="/Logos/Main logo black background.png"
                alt="Synth Logo"
                className="w-full h-full object-contain filter drop-shadow-2xl"
                width={128}
                height={128}
                fetchPriority="high"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-pink-700 rounded-full blur-xl opacity-30 animate-pulse"></div>
            </div>
          </div>
        </div>
      </section>

      {/* App Preview - Demo Photos (all 5 embedded) */}
      <section id="preview" className="relative z-10 px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 font-display">
              See Synth in Action
            </h2>
            <p className="text-lg text-gray-700 max-w-3xl mx-auto">
              Explore live music through artists, venues, and your community. Built for real music fans.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {DEMO_IMAGES.map((img, i) => (
              <img
                key={i}
                src={img.src}
                alt={img.alt}
                className="w-full h-auto object-contain rounded-2xl"
              />
            ))}
          </div>

          <JuicerEmbed />
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="relative z-10 px-6 py-20">
        {/* Pink marble swooshes for About section */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -right-32 w-96 h-96 bg-pink-400/12 rounded-[60%_40%_50%_50%] blur-3xl animate-pulse delay-200"></div>
          <div className="absolute bottom-1/4 -left-32 w-80 h-80 bg-pink-300/10 rounded-[40%_60%_50%_50%] blur-3xl animate-pulse delay-500"></div>
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 font-display">
              Built by <span className="bg-gradient-to-r from-pink-500 to-pink-700 bg-clip-text text-transparent">Music Lovers</span>
            </h2>
            <p className="text-xl text-gray-700 max-w-3xl mx-auto">
              We understand the magic of live music and the power of community
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="glass-card p-8 hover:shadow-2xl hover:shadow-pink-500/20 transition-all duration-300 border-pink-200/30">
                <h3 className="text-2xl font-bold text-gray-900 mb-4 font-display">Our Mission</h3>
                <p className="text-gray-700 leading-relaxed">
                  We believe that music is better when shared. Synth was born from our own experiences
                  of missing out on amazing concerts because we couldn't find anyone to go with.
                  We're building the platform we wished existed.
                </p>
              </div>

              <div className="glass-card p-8 hover:shadow-2xl hover:shadow-pink-500/20 transition-all duration-300 border-pink-200/30">
                <h3 className="text-2xl font-bold text-gray-900 mb-4 font-display">The Vision</h3>
                <p className="text-gray-700 leading-relaxed">
                  A world where every music lover can find their people and every show sparks lasting connections powered by community.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              {/* Sam Loiterstein */}
              <a href="https://www.linkedin.com/in/sam-loiterstein/" target="_blank" rel="noopener noreferrer" className="block group">
                <div className="glass-card p-6 flex items-center space-x-4 hover:shadow-2xl hover:shadow-pink-500/20 transition-all duration-300 border-pink-200/30">
                  <div className="relative">
                    <img
                      src="/founders/Sam.PNG"
                      alt="Sam Loiterstein"
                      className="w-20 h-20 rounded-full object-cover border-2 border-pink-400/50 group-hover:border-pink-500/70 transition-colors"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pink-400/10 to-transparent"></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xl font-bold text-gray-900 font-display">Sam Loiterstein</h4>
                        <p className="text-pink-600 font-semibold">Co-Founder & CEO</p>
                      </div>
                      <ExternalLink className="w-5 h-5 text-pink-500 group-hover:text-pink-600 transition-colors" />
                    </div>
                    <p className="text-gray-700 text-sm mt-2">
                      Product leader passionate about building safe, friendly concert experiences and real community around live music.
                    </p>
                  </div>
                </div>
              </a>

              {/* Tej Patel */}
              <a href="https://www.linkedin.com/in/tej-patel-49740a28a/" target="_blank" rel="noopener noreferrer" className="block group">
                <div className="glass-card p-6 flex items-center space-x-4 hover:shadow-2xl hover:shadow-pink-500/20 transition-all duration-300 border-pink-200/30">
                  <div className="relative">
                    <img
                      src="/founders/Tej.PNG"
                      alt="Tej Patel"
                      className="w-20 h-20 rounded-full object-cover border-2 border-pink-400/50 group-hover:border-pink-500/70 transition-colors"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pink-400/10 to-transparent"></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xl font-bold text-gray-900 font-display">Tej Patel</h4>
                        <p className="text-pink-600 font-semibold">Co-Founder & CTO</p>
                      </div>
                      <ExternalLink className="w-5 h-5 text-pink-500 group-hover:text-pink-600 transition-colors" />
                    </div>
                    <p className="text-gray-700 text-sm mt-2">
                      Engineer focused on modern, privacy-conscious platforms that bring music fans together.
                    </p>
                  </div>
                </div>
              </a>

              {/* Lauren Pesce */}
              <a href="https://www.linkedin.com/in/laurenpesce/" target="_blank" rel="noopener noreferrer" className="block group">
                <div className="glass-card p-6 flex items-center space-x-4 hover:shadow-2xl hover:shadow-pink-500/20 transition-all duration-300 border-pink-200/30">
                  <div className="relative">
                    <img
                      src="/founders/Lauren.PNG"
                      alt="Lauren Pesce"
                      className="w-20 h-20 rounded-full object-cover border-2 border-pink-400/50 group-hover:border-pink-500/70 transition-colors"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pink-400/10 to-transparent"></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xl font-bold text-gray-900 font-display">Lauren Pesce</h4>
                        <p className="text-pink-600 font-semibold">Frontend Engineer</p>
                      </div>
                      <ExternalLink className="w-5 h-5 text-pink-500 group-hover:text-pink-600 transition-colors" />
                    </div>
                    <p className="text-gray-700 text-sm mt-2">
                      Creating authentic, social experiences for the most dedicated live music fans.
                    </p>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA - Download Today */}
      <section id="download" className="relative z-10 px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card p-12 border-pink-200/40">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 font-display">
              Download Synth Today
            </h2>
            <p className="text-lg text-gray-700 mb-8 max-w-2xl mx-auto">
              Explore live music through artists, venues, and your community. Built for real music fans.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Button
                onClick={openWebBeta}
                className="bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white px-10 py-5 text-lg font-semibold shadow-2xl shadow-pink-500/30 hover:shadow-pink-500/40 transition-all duration-300 transform hover:scale-105 rounded-full w-full sm:w-auto"
              >
                Try Synth Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                onClick={openAppStore}
                variant="outline"
                className="border-2 border-pink-400 text-pink-700 hover:bg-pink-50 px-10 py-5 text-lg font-semibold rounded-full w-full sm:w-auto"
              >
                Download on the App Store
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>

            <div className="mt-10 pt-8 border-t border-pink-200/30">
              <p className="text-sm text-gray-600 mb-4">Get updates on new features and shows</p>
              <form onSubmit={handleEmailSubmit} className="max-w-md mx-auto">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 bg-white/90 backdrop-blur-sm border-pink-200/50 text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-pink-500"
                  />
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    variant="outline"
                    className="border-pink-300 text-pink-600 hover:bg-pink-50"
                  >
                    {isSubmitting ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500" />
                    ) : (
                      'Notify me'
                    )}
                  </Button>
                </div>
              </form>
              <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gray-500">
                <span className="flex items-center">
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  No spam
                </span>
                <span className="flex items-center">
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  Unsubscribe anytime
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-12 border-t border-pink-200/30" aria-label="Site footer">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-6">
            <img
              src="/Logos/Main logo black background.png"
              alt="Synth Logo"
              className="h-8 w-8"
            />
            <span className="text-xl font-bold bg-gradient-to-r from-pink-500 to-pink-700 bg-clip-text text-transparent">
              Synth
            </span>
          </div>
          <p className="text-gray-600 mb-6">
            Connecting music lovers through safe, fun, and friendly concert experiences
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <a
              href={SYNTH_WEB_BETA_URL}
              className="inline-flex items-center text-pink-600 hover:text-pink-700 font-medium"
            >
              Try Synth Now
              <ArrowRight className="w-4 h-4 ml-1" />
            </a>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-pink-600 hover:text-pink-700 font-medium"
            >
              Download on the App Store
              <ExternalLink className="w-4 h-4 ml-1" />
            </a>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8 text-sm text-gray-600">
            <a href="#" className="hover:text-pink-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-pink-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-pink-600 transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {/* Sticky Mobile CTA — web beta + App Store */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="bg-gradient-to-r from-pink-600 to-pink-500 p-3 space-y-2 shadow-lg">
          <a
            href={SYNTH_WEB_BETA_URL}
            className="block w-full bg-white text-pink-600 hover:bg-white/90 font-semibold px-6 py-3 rounded-md text-center"
          >
            Try Synth Now
          </a>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-white/15 text-white border border-white/40 hover:bg-white/25 font-semibold px-6 py-3 rounded-md text-center"
          >
            Download on the App Store
          </a>
        </div>
      </div>
      </main>
    </div>
  );
};
