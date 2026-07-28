import React from 'react';

export const LaunchAppPreview = () => {
  return (
    <section id="preview" className="py-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-balance text-gray-900">Beautiful design meets powerful features</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto text-balance">
            Experience a sleek, intuitive interface designed for music lovers.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="glass-card p-1 overflow-hidden rounded-2xl">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-KUfGi5e5m1PSJYa76eVUztDOn1JSmi.png"
                alt="Concert Feed Interface"
                className="w-full h-auto rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-3xl font-bold text-gray-900">Your personalized concert feed</h3>
              <p className="text-lg text-gray-600 leading-relaxed">
                Stay connected with the latest concerts, reviews, and activity from your friends. Filter by events,
                reviews, or news to find exactly what you're looking for.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-3xl font-bold text-gray-900">Build your music profile</h3>
              <p className="text-lg text-gray-600 leading-relaxed">
                Track your concert history, share reviews, and connect with fellow music enthusiasts. Your profile
                becomes your personal concert diary.
              </p>
            </div>

            <div className="glass-card p-1 overflow-hidden rounded-2xl">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-dRTjjO6amdM93VqXaDAga9HQBzUg8s.png"
                alt="User Profile Interface"
                className="w-full h-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LaunchAppPreview;
