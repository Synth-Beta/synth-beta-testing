import React from 'react';
import { Calendar, MessageCircle, Star, TrendingUp, Users, Zap } from 'lucide-react';

const features = [
  {
    icon: Calendar,
    title: "Concert Discovery",
    description: "Find upcoming concerts and events from your favorite artists and venues near you.",
  },
  {
    icon: Star,
    title: "Reviews & Ratings",
    description: "Share your concert experiences and read authentic reviews from the community.",
  },
  {
    icon: Users,
    title: "Social Connection",
    description: "Connect with friends, follow music lovers, and see what concerts they're attending.",
  },
  {
    icon: MessageCircle,
    title: "Community Feed",
    description: "Stay updated with the latest concert news, reviews, and friend activity in your feed.",
  },
  {
    icon: TrendingUp,
    title: "Personalized Recommendations",
    description: "Get concert suggestions based on your music taste and attendance history.",
  },
  {
    icon: Zap,
    title: "Instant Notifications",
    description: "Never miss a show with alerts for new concerts, ticket sales, and friend activity.",
  },
];

export const LaunchFeatures = () => {
  return (
    <section id="features" className="py-32 px-4 relative">
      {/* Light gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-pink-50/30 to-transparent" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="text-center space-y-6 mb-20">
          <h2 className="text-5xl md:text-6xl font-bold text-balance text-gray-900">Everything you need for live music</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto text-balance leading-relaxed">
            A complete platform to discover, review, and share your concert experiences.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="glass-card p-8 rounded-2xl hover:shadow-xl hover:shadow-pink-600/10 transition-all duration-300 group"
            >
              <div className="w-14 h-14 rounded-xl bg-pink-600/10 flex items-center justify-center mb-6 group-hover:bg-pink-600/20 transition-colors">
                <feature.icon className="w-7 h-7 text-pink-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LaunchFeatures;
