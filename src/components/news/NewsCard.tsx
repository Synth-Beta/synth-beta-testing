import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ExternalLink, 
  Calendar, 
  User,
  Newspaper,
  Star
} from 'lucide-react';
import { NewsArticle } from '@/types/news';
import { format, parseISO } from 'date-fns';

interface NewsCardProps {
  article: NewsArticle;
  className?: string;
}

export function NewsCard({ article, className = '' }: NewsCardProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      const now = new Date();
      const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);
      
      if (diffInHours < 24) {
        return format(date, 'h:mm a');
      } else if (diffInHours < 168) { // 7 days
        return format(date, 'EEEE');
      } else {
        return format(date, 'MMM d');
      }
    } catch (error) {
      return 'Recent';
    }
  };

  const truncateText = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  const handleReadMore = () => {
    window.open(article.link, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-all duration-200 cursor-pointer group ${className}`}>
      {/* Image Section */}
      {article.imageUrl && (
        <div className="h-48 w-full overflow-hidden bg-gray-100">
          <img 
            src={article.imageUrl} 
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
            onError={(e) => {
              // Hide image if it fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.parentElement!.style.display = 'none';
            }}
          />
        </div>
      )}

      <CardContent className="p-4">
        {/* Header with source badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge 
              variant="secondary" 
              className="flex items-center gap-1 text-xs bg-pink-100 text-pink-700 hover:bg-pink-200"
            >
              <Newspaper className="w-3 h-3" />
              {article.source}
            </Badge>
            
            {/* Show "For You" badge for high-scoring personalized articles */}
            {article.relevance_score && article.relevance_score > 50 && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1 text-xs bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border-purple-200"
              >
                <Star className="w-3 h-3 fill-purple-500" />
                For You
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            {formatDate(article.pubDate)}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-lg mb-2 line-clamp-2 text-gray-900 group-hover:text-pink-600 transition-colors">
          {article.title}
        </h3>

        {/* Description */}
        {article.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-3 leading-relaxed">
            {truncateText(article.description)}
          </p>
        )}

        {/* Author */}
        {article.author && (
          <div className="flex items-center gap-1 mb-3 text-xs text-gray-500">
            <User className="w-3 h-3" />
            <span>{article.author}</span>
          </div>
        )}

        {/* Read More Button */}
        <Button 
          onClick={handleReadMore}
          variant="outline" 
          size="sm"
          className="w-full border-pink-200 text-pink-600 hover:bg-pink-50 hover:border-pink-300 transition-colors"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Read More
        </Button>
      </CardContent>
    </Card>
  );
}

// Loading skeleton for news cards
export function NewsCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Image skeleton */}
      <div className="h-48 w-full bg-gray-200 animate-pulse" />
      
      <CardContent className="p-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Title skeleton */}
        <div className="space-y-2 mb-2">
          <div className="h-5 w-full bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Description skeleton */}
        <div className="space-y-2 mb-3">
          <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-2/3 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Author skeleton */}
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-3" />

        {/* Button skeleton */}
        <div className="h-8 w-full bg-gray-200 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}
