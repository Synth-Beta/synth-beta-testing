import React, { useState, useEffect, useRef } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Search, X, Phone, User } from 'lucide-react';

export type Attendee = 
  | { type: 'user'; user_id: string; name: string; avatar_url?: string }
  | { type: 'phone'; phone: string; name?: string };

interface AttendeeSelectorProps {
  value: Attendee[];
  onChange: (attendees: Attendee[]) => void;
  userId: string;
  metOnSynth: boolean;
  onMetOnSynthChange: (metOnSynth: boolean) => void;
}

interface UserProfile {
  user_id: string;
  name: string;
  avatar_url?: string;
}

export function AttendeeSelector({ value, onChange, userId, metOnSynth, onMetOnSynthChange }: AttendeeSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneName, setPhoneName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Search users with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data: profiles, error } = await supabase
          .from('users')
          .select('user_id, name, avatar_url')
          .ilike('name', `%${searchQuery}%`)
          .neq('user_id', userId) // Exclude current user
          .order('name', { ascending: true })
          .limit(10);

        if (error) {
          console.error('Error searching users:', error);
          setSearchResults([]);
        } else {
          setSearchResults(profiles || []);
        }
      } catch (error) {
        console.error('Error searching users:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, userId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddUser = (user: UserProfile) => {
    const newAttendee: Attendee = {
      type: 'user',
      user_id: user.user_id,
      name: user.name,
      avatar_url: user.avatar_url,
    };
    
    // Check if user is already added
    const isAlreadyAdded = value.some(
      a => a.type === 'user' && a.user_id === user.user_id
    );
    
    if (!isAlreadyAdded) {
      onChange([...value, newAttendee]);
    }
    setSearchQuery('');
  };

  const handleRemoveAttendee = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleInviteByPhone = () => {
    if (!phoneNumber.trim()) return;

    const newAttendee: Attendee = {
      type: 'phone',
      phone: phoneNumber,
      name: phoneName.trim() || undefined,
    };

    // Check if phone is already added
    const isAlreadyAdded = value.some(
      a => a.type === 'phone' && a.phone === phoneNumber
    );

    if (!isAlreadyAdded) {
      onChange([...value, newAttendee]);
    }

    // Reset phone fields
    setPhoneNumber('');
    setPhoneName('');
  };

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative" ref={containerRef}>
        <SearchBar
          value={searchQuery}
          onChange={(value) => setSearchQuery(value)}
          placeholder="Search Synth users or invite by phone..."
          widthVariant="full"
        />
      </div>

      {/* Search Results - Inline so they scroll with the page */}
      {searchQuery && (
        <div className="w-full bg-white border-2 border-pink-200 rounded-lg shadow-2xl max-h-[500px] overflow-y-auto">
          {isSearching ? (
            <div className="p-4 text-center text-sm text-gray-500">Searching...</div>
          ) : searchResults.length > 0 ? (
            <>
              {searchResults.map((user) => {
                const isAlreadyAdded = value.some(
                  a => a.type === 'user' && a.user_id === user.user_id
                );
                
                return (
                  <button
                    key={user.user_id}
                    onClick={() => handleAddUser(user)}
                    disabled={isAlreadyAdded}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url} alt={user.name} />
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    </div>
                    {isAlreadyAdded && (
                      <span className="text-xs text-green-600">Added</span>
                    )}
                  </button>
                );
              })}
              
              {/* Invite to Synth Option */}
              <div className="border-t border-gray-200 p-3 bg-gray-50">
                <Label className="text-xs font-semibold text-gray-700 mb-2 block">Add by Phone</Label>
                <div className="space-y-2">
                  <Input
                    type="tel"
                    placeholder="Phone: +1234567890"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    type="text"
                    placeholder="Name (optional)"
                    value={phoneName}
                    onChange={(e) => setPhoneName(e.target.value)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleInviteByPhone}
                    disabled={!phoneNumber.trim()}
                    className="w-full text-sm"
                  >
                    Add Contact
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-sm text-gray-500">
              No users found. Use the phone option below to add them.
            </div>
          )}
        </div>
      )}

      {/* Selected Attendees */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((attendee, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full"
            >
              {attendee.type === 'user' ? (
                <>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={attendee.avatar_url} alt={attendee.name} />
                    <AvatarFallback>{attendee.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-gray-900">{attendee.name}</span>
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900">
                    {attendee.name || attendee.phone}
                  </span>
                </>
              )}
              <button
                onClick={() => handleRemoveAttendee(index)}
                className="ml-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Met on Synth Checkbox */}
      {value.length > 0 && value.some(a => a.type === 'user') && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="metOnSynth"
            checked={metOnSynth}
            onChange={(e) => onMetOnSynthChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
          />
          <Label htmlFor="metOnSynth" className="text-sm text-gray-700 cursor-pointer">
            Did you meet or plan this on Synth?
          </Label>
        </div>
      )}
    </div>
  );
}
