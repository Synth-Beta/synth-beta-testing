import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Heart, MessageCircle, Calendar, MapPin, Music } from 'lucide-react';
import { format } from 'date-fns';

interface PostGridItem {
  id: string;
  type: 'review' | 'event';
  image?: string;
  images?: string[];
  title: string;
  subtitle: string;
  rating?: number;
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
    // rating can be fractional (e.g., 3.5). Show half by overlaying a clipped star.
    return Array.from({ length: 5 }, (_, i) => {
      const index = i + 1;
      const isFull = rating >= index;
      const isHalf = !isFull && rating >= index - 0.5;
      return (
        <div key={i} className="relative w-3 h-3">
          <Star className={`w-3 h-3 ${isFull ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
          {isHalf && (
            <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
              <Star className="w-3 h-3 text-yellow-400 fill-current" />
            </div>
          )}
        </div>
      );
    });
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
    <div className="grid grid-cols-3 gap-1 md:gap-2">
      {posts.map((post) => (
        <Card 
          key={post.id}
          className="aspect-square cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
          onClick={() => onPostClick(post)}
        >
          <CardContent className="p-0 h-full relative">
            {/* Image or Placeholder */}
            <div className="w-full h-2/3 bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 flex items-center justify-center overflow-hidden">
              {post.image ? (
                <img 
                  src={post.image} 
                  alt={post.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-white text-center">
                  {post.type === 'review' ? (
                    <Star className="w-8 h-8 mx-auto mb-1" />
                  ) : (
                    <Heart className="w-8 h-8 mx-auto mb-1" />
                  )}
                </div>
              )}
              
              {/* Overlay badges */}
              <div className="absolute top-2 right-2">
                {post.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {post.badge}
                  </Badge>
                )}
              </div>
              
              {/* Rating overlay intentionally removed in profile grid to avoid UI overlap */}
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
                  <span>{format(new Date(post.date), 'MMM d, yyyy')}</span>
                </div>
                {post.type === 'review' && typeof post.rating === 'number' && (
                  <div className="flex items-center gap-0.5">
                    {renderStars(post.rating)}
                  </div>
                )}
                
                {(post.likes || post.comments) && (
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
      ))}
    </div>
  );
};
