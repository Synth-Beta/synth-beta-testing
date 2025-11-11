import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Heart, MessageCircle, Calendar, MapPin, Music } from 'lucide-react';
import { format } from 'date-fns';
import { getFallbackEventImage } from '@/utils/eventImageFallbacks';

interface PostGridItem {
  id: string;
  type: 'review' | 'event';
  image?: string;
  title: string;
  subtitle: string;
  rating?: number; // 1-5 star rating for reviews
  date: string;
  location?: string;
  likes?: number;
  comments?: number;
  badge?: string;
}

interface PostsGridProps {
  posts: PostGridItem[];
  onPostClick: (post: PostGridItem) => void;
}

export const PostsGrid = ({ posts, onPostClick }: PostsGridProps) => {
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3 h-3 ${
          i < Math.floor(rating) ? "text-yellow-400 fill-current" : 
          i === Math.floor(rating) && rating % 1 >= 0.5 ? "text-yellow-400 fill-current" :
          "text-gray-300"
        }`}
      />
    ));
  };

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <Music className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-muted-foreground mb-2">No Posts Yet</h3>
        <p className="text-sm text-muted-foreground">
          Start attending events and writing reviews to build your profile!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1 md:gap-2 pb-8">
      {posts.map((post) => {
        const hasUserImage = Boolean(post.image);
        const imageSrc = post.image || getFallbackEventImage(`${post.id}-${post.title}-${post.date}`);
        return (
          <Card 
            key={post.id}
            className="aspect-square cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
            onClick={() => onPostClick(post)}
          >
            <CardContent className="p-0 h-full relative">
              {/* Image */}
              <div className="relative w-full h-2/3 overflow-hidden">
                <img 
                  src={imageSrc} 
                  alt={post.title}
                  className={`w-full h-full object-cover transition-transform duration-500 ${hasUserImage ? '' : 'scale-105'}`}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" aria-hidden="true" />
                
                {/* Overlay badges */}
                <div className="absolute top-2 right-2">
                  {post.badge && (
                    <Badge variant="secondary" className="text-xs">
                      {post.badge}
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Content */}
              <div className="p-2 h-1/3 flex flex-col justify-between">
                <div>
                  <h4 className="font-semibold text-xs truncate">{post.title}</h4>
                  <p className="text-xs text-muted-foreground truncate">{post.subtitle}</p>
                </div>
                
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{format(new Date(post.date), 'MMM d')}</span>
                  </div>
                  
                  {/* Rating for reviews */}
                  {post.type === 'review' && post.rating && (
                    <div className="flex items-center gap-1">
                      {renderStars(post.rating)}
                    </div>
                  )}
                  
                  {/* Likes and comments for other post types */}
                  {post.type !== 'review' && (post.likes || post.comments) && (
                    <div className="flex items-center gap-2">
                      {post.likes && (
                        <div className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          <span>{post.likes}</span>
                        </div>
                      )}
                      {post.comments && (
                        <div className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          <span>{post.comments}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
