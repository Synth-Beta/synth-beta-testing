/**
 * Demo Messages Page - Same layout and components as production UnifiedChatView
 * 
 * Uses same UI components but with hardcoded mock data.
 * NO API calls - all data is from mockData.ts
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserInfo } from '@/components/profile/UserInfo';
import { Input } from '@/components/ui/input';
import { DEMO_USER, DEMO_CHATS, DEMO_MESSAGES } from '../data/mockData';
import { format, parseISO, differenceInMinutes, isToday, isYesterday, isThisWeek } from 'date-fns';
import { ArrowLeft, Users, Send } from 'lucide-react';

interface DemoMessagesPageProps {
  menuOpen?: boolean;
  onMenuClick?: () => void;
  onNavigate?: (page: 'home' | 'discover' | 'profile' | 'messages' | 'create-post') => void;
}

export const DemoMessagesPage: React.FC<DemoMessagesPageProps> = ({
  menuOpen = false,
  onMenuClick,
  onNavigate,
}) => {
  const navigate = useNavigate();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');

  const selectedChat = selectedChatId ? DEMO_CHATS.find(c => c.id === selectedChatId) : null;
  const messages = selectedChatId ? (DEMO_MESSAGES[selectedChatId as keyof typeof DEMO_MESSAGES] || []) : [];

  const handleBack = () => {
    if (selectedChatId) {
      setSelectedChatId(null);
    } else {
      if (onNavigate) {
        onNavigate('home');
      } else {
        navigate('/mobile-preview/component-view');
      }
    }
  };

  const formatSessionTimestamp = (date: Date): React.ReactNode => {
    if (isToday(date)) {
      return (
        <>
          <span style={{ fontWeight: 700 }}>Today</span>{' '}
          <span style={{ fontWeight: 500 }}>at {format(date, 'h:mm a')}</span>
        </>
      );
    } else if (isYesterday(date)) {
      return (
        <>
          <span style={{ fontWeight: 700 }}>Yesterday</span>{' '}
          <span style={{ fontWeight: 500 }}>at {format(date, 'h:mm a')}</span>
        </>
      );
    } else if (isThisWeek(date, { weekStartsOn: 0 })) {
      return (
        <>
          <span style={{ fontWeight: 700 }}>{format(date, 'EEEE')}</span>{' '}
          <span style={{ fontWeight: 500 }}>at {format(date, 'h:mm a')}</span>
        </>
      );
    } else {
      return (
        <>
          <span style={{ fontWeight: 700 }}>{format(date, 'MMM d')}</span>{' '}
          <span style={{ fontWeight: 500 }}>at {format(date, 'h:mm a')}</span>
        </>
      );
    }
  };

  // Chat List View - EXACT same structure as production
  if (!selectedChat) {
    return (
      <div
        className="flex min-h-screen w-full max-w-[393px] mx-auto" style={{ backgroundColor: 'var(--color-off-white, #FCFCFC)' }}
      >
        <div className="w-full border-synth-black/10 backdrop-blur-md flex flex-col shadow-2xl" style={{ backgroundColor: 'rgba(252, 252, 252, 0.98)' }}>
          <MobileHeader menuOpen={menuOpen} onMenuClick={onMenuClick}>
            <h1 className="font-bold text-[24px] text-[#0e0e0e] leading-[normal]">Messages</h1>
          </MobileHeader>

          <div className="flex-1 overflow-y-auto px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 68px + 12px)', paddingBottom: 'var(--spacing-bottom-nav, 32px)' }}>
            <div className="space-y-2">
              {DEMO_CHATS.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => setSelectedChatId(chat.id)}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer" 
                  style={{ borderRadius: '10px' }}
                >
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={chat.event_image_url || undefined} />
                    <AvatarFallback className="bg-synth-beige/50">
                      {chat.is_group_chat ? (
                        <Users className="w-6 h-6 text-synth-black" />
                      ) : (
                        chat.chat_name.split(' ').map(n => n[0]).join('').substring(0, 2)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-[#0e0e0e] truncate">{chat.chat_name}</h3>
                      {chat.latest_message_created_at && (
                        <span className="text-[#5d646f] flex-shrink-0 ml-2" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                          {format(parseISO(chat.latest_message_created_at), 'h:mm a')}
                        </span>
                      )}
                    </div>
                    <p className="text-[#5d646f] truncate" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>{chat.latest_message}</p>
                  </div>
                  {chat.has_unread && (
                    <div className="w-2 h-2 bg-synth-pink rounded-full flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat Thread View - EXACT same structure as production
  const messageGroups: Array<Array<typeof messages[0]>> = [];
  let currentGroup: Array<typeof messages[0]> = [];

  messages.forEach((message, index) => {
    const messageTime = parseISO(message.created_at);
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const prevMessageTime = prevMessage ? parseISO(prevMessage.created_at) : null;

    const isNewSender = prevMessage && prevMessage.sender_id !== message.sender_id;
    const isLargeTimeGap = prevMessageTime && differenceInMinutes(messageTime, prevMessageTime) >= 30;

    if (isNewSender || isLargeTimeGap) {
      if (currentGroup.length > 0) {
        messageGroups.push(currentGroup);
      }
      currentGroup = [message];
    } else {
      currentGroup.push(message);
    }
  });

  if (currentGroup.length > 0) {
    messageGroups.push(currentGroup);
  }

  return (
    <div
      className="flex min-h-screen w-full max-w-[393px] mx-auto" style={{ backgroundColor: 'var(--color-off-white, #FCFCFC)' }}
    >
      <div className="w-full flex flex-col min-h-0" style={{ backgroundColor: 'var(--color-off-white, #FCFCFC)' }}>
        <MobileHeader menuOpen={menuOpen} onMenuClick={onMenuClick}>
          <div className="flex items-center gap-[6px]">
            <button
              onClick={handleBack}
              className="w-6 h-6 flex items-center justify-center cursor-pointer"
            >
              <ArrowLeft className="w-6 h-6 text-[#0e0e0e]" />
            </button>
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarImage src={selectedChat.event_image_url || undefined} />
              <AvatarFallback className="bg-synth-beige/50 text-synth-black font-medium" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-body-size, 20px)', fontWeight: 'var(--typography-body-weight, 500)', lineHeight: 'var(--typography-body-line-height, 1.5)' }}>
                {selectedChat.is_group_chat ? (
                  <Users className="w-5 h-5" />
                ) : (
                  selectedChat.chat_name.split(' ').map(n => n[0]).join('')
                )}
              </AvatarFallback>
            </Avatar>
            <h2 className="font-bold text-[24px] text-[#0e0e0e] leading-[normal]">
              {selectedChat.chat_name}
            </h2>
          </div>
        </MobileHeader>

        {/* Messages - EXACT same structure as production */}
        <div className="flex-1 overflow-y-auto px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 68px + 12px)', paddingBottom: 'var(--spacing-bottom-nav, 32px)', backgroundColor: 'var(--color-off-white, #FCFCFC)' }}>
          <div className="flex flex-col" style={{ maxWidth: '353px', margin: '0 auto' }}>
            {messageGroups.map((group, groupIndex) => {
              const firstMessage = group[0];
              const lastMessage = group[group.length - 1];
              const isSent = firstMessage.sender_id === DEMO_USER.id;
              const messageDate = parseISO(firstMessage.created_at);

              // Show session timestamp for first group or if 30+ min gap
              const showSessionDate = groupIndex === 0 || 
                (groupIndex > 0 && differenceInMinutes(messageDate, parseISO(messageGroups[groupIndex - 1][messageGroups[groupIndex - 1].length - 1].created_at)) >= 30);

              const showSenderInfo = selectedChat.is_group_chat &&
                firstMessage.sender_id !== DEMO_USER.id &&
                (groupIndex === 0 || messageGroups[groupIndex - 1][0].sender_id !== firstMessage.sender_id);

              return (
                <div key={`group-${groupIndex}`} className={`flex flex-col ${isSent ? 'items-end' : 'items-start'} ${groupIndex > 0 ? 'mt-[24px]' : ''}`}>
                  {showSessionDate && (
                    <div className="flex justify-center w-full mb-[24px]">
                      <p style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        color: '#5D646F',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)'
                      }}>
                        {formatSessionTimestamp(messageDate)}
                      </p>
                    </div>
                  )}

                  {showSenderInfo && (
                    <div className="flex items-center gap-[6px]" style={{ marginBottom: '6px' }}>
                      <UserInfo
                        name={firstMessage.sender_name}
                        initial={firstMessage.sender_name.split(' ').map(n => n[0]).join('')}
                        imageUrl={firstMessage.sender_avatar || undefined}
                        variant="chat"
                      />
                    </div>
                  )}

                  {group.map((message, msgIndex) => {
                    const isLastInGroup = msgIndex === group.length - 1;
                    return (
                      <div key={message.id} className={`flex flex-col ${msgIndex > 0 ? 'mt-[6px]' : ''}`}>
                        <div
                          className="max-w-[172px] p-[12px]"
                          style={{
                            borderRadius: '10px',
                            backgroundColor: message.sender_id === DEMO_USER.id
                              ? 'var(--brand-pink-500)'
                              : 'var(--state-disabled-bg)',
                            border: message.sender_id === DEMO_USER.id
                              ? 'none'
                              : '1px solid var(--neutral-200)',
                          }}
                        >
                          <p style={{
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-body-size, 20px)',
                            fontWeight: 'var(--typography-body-weight, 500)',
                            lineHeight: 'var(--typography-body-line-height, 1.5)',
                            margin: 0,
                            color: message.sender_id === DEMO_USER.id
                              ? 'var(--neutral-50)'
                              : 'var(--neutral-900)'
                          }}>
                            {message.content}
                          </p>
                        </div>
                        {isLastInGroup && (
                          <p className={`text-[16px] text-[var(--neutral-600)] font-normal leading-[normal] mt-[6px] ${isSent ? 'text-right' : 'text-left'}`}>
                            {format(parseISO(message.created_at), 'h:mm a')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Message Input - EXACT same as production */}
        {!selectedChat.is_group_chat && (
          <div className="border-t px-5 py-3" style={{ borderColor: 'var(--neutral-200)', backgroundColor: 'var(--neutral-50)' }}>
            <div className="flex items-center gap-2">
              <Input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && messageInput.trim()) {
                    console.log('Demo: Send message', messageInput);
                    setMessageInput('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (messageInput.trim()) {
                    console.log('Demo: Send message', messageInput);
                    setMessageInput('');
                  }
                }}
                className="w-10 h-10 flex items-center justify-center bg-synth-pink"
                style={{ borderRadius: '10px', color: 'var(--neutral-50)' }}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
