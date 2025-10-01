import React, { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Music, 
  Clock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from 'date-fns';
import { JamBaseEventResponse } from '@/services/jambaseEventsService';
import { cn } from '@/lib/utils';

interface EventCalendarViewProps {
  events: JamBaseEventResponse[];
  selectedDate?: Date;
  onDateSelect: (date: Date | undefined) => void;
  onEventClick: (event: JamBaseEventResponse) => void;
  className?: string;
  heightClass?: string; // Tailwind class to control calendar height
}

export const EventCalendarView: React.FC<EventCalendarViewProps> = ({
  events,
  selectedDate,
  onDateSelect,
  onEventClick,
  className = '',
  heightClass = 'h-96'
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, JamBaseEventResponse[]> = {};
    
    events.forEach(event => {
      try {
        const eventDate = new Date(event.event_date);
        const dateKey = format(eventDate, 'yyyy-MM-dd');
        
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(event);
      } catch (error) {
        console.error('Error parsing event date:', event.event_date);
      }
    });
    
    return grouped;
  }, [events]);

  // Get events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return eventsByDate[dateKey] || [];
  }, [selectedDate, eventsByDate]);

  // Get days with events for current month
  const daysWithEvents = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    return days.filter(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      return eventsByDate[dateKey] && eventsByDate[dateKey].length > 0;
    });
  }, [currentMonth, eventsByDate]);

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleTodayClick = () => {
    const today = new Date();
    setCurrentMonth(today);
    onDateSelect(today);
  };

  // Custom day cell renderer
  const DayCell = ({ date, displayMonth }: { date: Date; displayMonth: Date }) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayEvents = eventsByDate[dateKey] || [];
    const isSelected = selectedDate && isSameDay(date, selectedDate);
    const isToday = isSameDay(date, new Date());
    const isCurrentMonth = date.getMonth() === displayMonth.getMonth();

    return (
      <div
        className={cn(
          'relative h-9 w-9 flex items-center justify-center text-sm cursor-pointer rounded-md transition-colors',
          isCurrentMonth ? 'text-foreground' : 'text-muted-foreground',
          // Make today's date text-highlighted (not pink background)
          isToday && 'text-primary font-semibold',
          isSelected && 'bg-primary text-primary-foreground font-semibold',
          dayEvents.length > 0 && !isSelected && 'hover:bg-accent hover:text-accent-foreground'
        )}
        onClick={() => onDateSelect(date)}
      >
        {format(date, 'd')}
        {dayEvents.length > 0 && (
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          <h2 className="text-lg font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousMonth}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleTodayClick}
          >
            Today
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Only (events list lives elsewhere) */}
      <Card>
        <CardContent className="p-4">
          <div className={cn('w-full', heightClass)}>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={onDateSelect}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              className="w-full h-full"
              classNames={{
                months: 'w-full h-full',
                month: 'w-full h-full',
                table: 'w-full',
                head_row: 'grid grid-cols-7',
                head_cell: 'text-muted-foreground font-medium text-xs sm:text-sm text-center',
                row: 'grid grid-cols-7 w-full mt-2',
                cell: 'p-0',
              }}
              components={{
                Day: ({ date, displayMonth }) => (
                  <DayCell date={date} displayMonth={displayMonth} />
                )
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Events Summary */}
      {daysWithEvents.length > 0 && (
        <div className="text-sm text-muted-foreground">
          <p>
            {daysWithEvents.length} day{daysWithEvents.length !== 1 ? 's' : ''} with events in {format(currentMonth, 'MMMM yyyy')}
          </p>
        </div>
      )}
    </div>
  );
};
