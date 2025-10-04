import { useState } from 'react';
import { Search, Filter, MapPin, Calendar, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Event } from '@/components/EventCard';
import { SynthSLogo } from '@/components/SynthSLogo';

interface EventListProps {
  events: Event[];
  onEventLike: (eventId: string) => void;
}

export const EventList = ({ events, onEventLike }: EventListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const categories = ['all', 'music', 'food', 'arts', 'sports', 'social'];

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         event.venue.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || event.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category: string) => {
    const colors = {
      music: 'category-music',
      food: 'category-food', 
      arts: 'category-arts',
      sports: 'category-sports',
      social: 'category-social'
    };
    return colors[category as keyof typeof colors] || 'category-social';
  };

  return (
    <div className="min-h-screen pb-20 px-4 pt-6">
      {/* Header */}
      <div className="glass-card inner-glow text-center space-y-3 p-4 mb-6 floating-shadow">
        <div className="flex items-center justify-center gap-3">
          <SynthSLogo size="sm" className="hover-icon" />
          <h1 className="gradient-text text-2xl font-bold">Discover Events</h1>
        </div>
        <p className="text-gray-600 text-sm">Find concerts, festivals, and amazing events near you</p>
      </div>

      {/* Search & Filter Controls */}
      <div className="glass-card inner-glow p-4 mb-6 floating-shadow">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5 hover-icon" />
          <Input
            id="event-list-search"
            name="eventListSearch"
            placeholder="Search events or venues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 h-12 border-2 border-gray-200 hover:border-pink-300 focus:border-pink-400 rounded-xl transition-all duration-200"
          />
        </div>

        {/* Category Filter */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className={`whitespace-nowrap hover-button ${
                selectedCategory === category 
                  ? "gradient-button" 
                  : "border-gray-300 hover:border-pink-400 hover:text-pink-500"
              }`}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Events Grid */}
      <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {filteredEvents.map((event) => (
          <Card key={event.id} className="glass-card inner-glow overflow-hidden floating-shadow hover-card">
            <div className="relative h-48 overflow-hidden rounded-t-2xl">
              <img 
                src={event.image} 
                alt={event.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm hover-icon ${getCategoryColor(event.category)}`}>
                  {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
                </span>
              </div>
              {event.price && (
                <div className="absolute top-3 right-3 gradient-badge rounded-full text-xs font-bold shadow-lg">
                  {event.price}
                </div>
              )}
            </div>
            
            <div className="p-4">
              <h3 className="font-semibold text-card-foreground mb-2 gradient-text">{event.title}</h3>
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{event.description}</p>
              
              <div className="space-y-1 mb-4">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Calendar className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                  <span>{event.date} at {event.time}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <MapPin className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                  <span>{event.venue}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{event.attendeeCount} interested</span>
                <Button
                  size="sm"
                  onClick={() => onEventLike(event.id)}
                  className="hover-button gradient-button"
                >
                  <Heart className="w-4 h-4 mr-2 hover-heart" aria-hidden="true" />
                  I'm In!
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredEvents.length === 0 && (
        <div className="glass-card inner-glow text-center py-12 px-6 rounded-2xl floating-shadow">
          <div className="text-gray-400 mb-4">
            <Search className="w-12 h-12 mx-auto hover-icon" />
          </div>
          <p className="text-gray-600 text-lg font-medium mb-2">No events found</p>
          <p className="text-gray-500 text-sm">Try adjusting your search or filter criteria</p>
        </div>
      )}
    </div>
  );
};