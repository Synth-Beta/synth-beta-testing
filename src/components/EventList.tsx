import { useState } from 'react';
import { Search, Filter, MapPin, Calendar, Heart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Event } from '@/components/EventCard';
import { SynthSLogo } from '@/components/SynthSLogo';

interface EventListProps {
  events: Event[];
  onEventLike: (eventId: string) => void;
}

export const EventList = ({ events, onEventLike }: EventListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = ['all', 'music', 'food', 'arts', 'sports', 'social'];

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         event.venue.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || event.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const metaStyle: React.CSSProperties = {
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-meta-size, 16px)',
    fontWeight: 'var(--typography-meta-weight, 500)',
    lineHeight: 'var(--typography-meta-line-height, 1.5)',
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        paddingBottom: 'var(--spacing-bottom-nav, 112px)',
        paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
        paddingRight: 'var(--spacing-screen-margin-x, 20px)',
        paddingTop: 'var(--spacing-grouped, 24px)',
        backgroundColor: 'var(--neutral-50)',
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: 'var(--neutral-50)',
          border: 'var(--border-default)',
          borderRadius: 'var(--radius-corner, 10px)',
          padding: 'var(--spacing-grouped, 24px)',
          marginBottom: 'var(--spacing-grouped, 24px)',
          textAlign: 'center',
        }}
      >
        <div className="flex items-center justify-center" style={{ gap: 'var(--spacing-small, 12px)', marginBottom: 'var(--spacing-inline, 6px)' }}>
          <SynthSLogo size="sm" />
          <h1
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h1-size, 35px)',
              fontWeight: 'var(--typography-h1-weight, 700)',
              lineHeight: 'var(--typography-h1-line-height, 1.2)',
              color: 'var(--neutral-900)',
              margin: 0,
            }}
          >
            Discover Events
          </h1>
        </div>
        <p style={{ ...metaStyle, color: 'var(--neutral-600)', margin: 0 }}>
          Find concerts, festivals, and amazing events near you
        </p>
      </div>

      {/* Search & Filter */}
      <div
        style={{
          backgroundColor: 'var(--neutral-50)',
          border: 'var(--border-default)',
          borderRadius: 'var(--radius-corner, 10px)',
          padding: 'var(--spacing-grouped, 24px)',
          marginBottom: 'var(--spacing-grouped, 24px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-small, 12px)',
        }}
      >
        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ width: '20px', height: '20px', color: 'var(--neutral-600)' }}
            aria-hidden="true"
          />
          <Input
            id="event-list-search"
            name="eventListSearch"
            placeholder="Search events or venues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            style={{
              paddingLeft: '44px',
              height: 'var(--size-input-height, 44px)',
              border: 'var(--border-default)',
              borderRadius: 'var(--radius-corner, 10px)',
              backgroundColor: 'var(--neutral-50)',
              color: 'var(--neutral-900)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
            }}
          />
        </div>

        {/* Category Filter */}
        <div className="flex overflow-x-auto" style={{ gap: 'var(--spacing-inline, 6px)', paddingBottom: 'var(--spacing-inline, 6px)' }}>
          {categories.map((category) => {
            const isActive = selectedCategory === category;
            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: '25px',
                  padding: '0 var(--spacing-small, 12px)',
                  backgroundColor: isActive ? 'var(--brand-pink-050)' : 'var(--neutral-50)',
                  color: 'var(--brand-pink-500)',
                  border: isActive ? '2px solid var(--brand-pink-500)' : 'var(--border-default)',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  whiteSpace: 'nowrap',
                }}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 'var(--spacing-small, 12px)' }}>
        {filteredEvents.map((event) => (
          <div
            key={event.id}
            style={{
              backgroundColor: 'var(--neutral-50)',
              border: 'var(--border-default)',
              borderRadius: 'var(--radius-corner, 10px)',
              overflow: 'hidden',
            }}
          >
            <div className="relative overflow-hidden" style={{ height: '192px' }}>
              <img
                src={event.image}
                alt={event.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute" style={{ top: 'var(--spacing-small, 12px)', left: 'var(--spacing-small, 12px)' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px var(--spacing-small, 12px)',
                    backgroundColor: 'var(--brand-pink-050)',
                    color: 'var(--brand-pink-500)',
                    border: '1px solid var(--brand-pink-500)',
                    borderRadius: '999px',
                    ...metaStyle,
                  }}
                >
                  {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
                </span>
              </div>
              {event.price && (
                <div className="absolute" style={{ top: 'var(--spacing-small, 12px)', right: 'var(--spacing-small, 12px)' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px var(--spacing-small, 12px)',
                      backgroundColor: 'var(--brand-pink-500)',
                      color: 'var(--neutral-50)',
                      borderRadius: '999px',
                      ...metaStyle,
                      fontWeight: 700,
                    }}
                  >
                    {event.price}
                  </span>
                </div>
              )}
            </div>

            <div style={{ padding: 'var(--spacing-small, 12px)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small, 12px)' }}>
              <h3
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-h2-size, 24px)',
                  fontWeight: 'var(--typography-h2-weight, 700)',
                  lineHeight: 'var(--typography-h2-line-height, 1.3)',
                  color: 'var(--neutral-900)',
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {event.title}
              </h3>
              <p
                style={{
                  ...metaStyle,
                  color: 'var(--neutral-600)',
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {event.description}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-inline, 6px)' }}>
                <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                  <Calendar style={{ width: '20px', height: '20px', color: 'var(--brand-pink-500)', flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ ...metaStyle, color: 'var(--neutral-600)' }}>{event.date} at {event.time}</span>
                </div>
                <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                  <MapPin style={{ width: '20px', height: '20px', color: 'var(--brand-pink-500)', flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ ...metaStyle, color: 'var(--neutral-600)' }}>{event.venue}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span style={{ ...metaStyle, color: 'var(--neutral-600)' }}>{event.attendeeCount} interested</span>
                <button
                  onClick={() => onEventLike(event.id)}
                  aria-label={`Mark interested in ${event.title}`}
                  style={{
                    height: 'var(--size-button-height, 36px)',
                    padding: '0 var(--spacing-small, 12px)',
                    backgroundColor: 'var(--brand-pink-500)',
                    color: 'var(--neutral-50)',
                    border: 'none',
                    borderRadius: 'var(--radius-corner, 10px)',
                    boxShadow: 'var(--shadow-default)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-inline, 6px)',
                    ...metaStyle,
                  }}
                >
                  <Heart style={{ width: '24px', height: '24px' }} aria-hidden="true" />
                  I'm In!
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredEvents.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--spacing-inline, 6px)',
            padding: 'var(--spacing-big-section, 60px) var(--spacing-grouped, 24px)',
            backgroundColor: 'var(--neutral-50)',
            border: 'var(--border-default)',
            borderRadius: 'var(--radius-corner, 10px)',
            marginTop: 'var(--spacing-grouped, 24px)',
          }}
        >
          <Search style={{ width: '60px', height: '60px', color: 'var(--neutral-600)' }} aria-hidden="true" />
          <p
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-body-size, 20px)',
              fontWeight: 'var(--typography-body-weight, 500)',
              lineHeight: 'var(--typography-body-line-height, 1.5)',
              color: 'var(--neutral-900)',
              margin: 0,
              textAlign: 'center',
            }}
          >
            No events found
          </p>
          <p style={{ ...metaStyle, color: 'var(--neutral-600)', margin: 0, textAlign: 'center' }}>
            Try adjusting your search or filter criteria
          </p>
        </div>
      )}
    </div>
  );
};
