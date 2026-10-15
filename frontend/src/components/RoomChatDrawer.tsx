'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuctionStore } from '../lib/store';
import { socketService } from '../lib/socket';
import TeamLogo from './TeamLogo';
import {
  MessageSquare,
  X,
  Send,
} from 'lucide-react';

interface RoomChatDrawerProps {
  roomId: string;
}

const QUICK_BANTERS = [
  'Bid more! 🔥',
  'Steal deal! 💎',
  'Too expensive! 💸',
  'RTM card? 🃏',
  'Out of purse! 🛑',
  'Let him cook 🍳',
  'Pass! ✋',
  'GG WP! 🏆',
];

export const RoomChatDrawer: React.FC<RoomChatDrawerProps> = ({ roomId }) => {
  const { messages, user, chatOpen, setChatOpen, room } = useAuctionStore();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (chatOpen) {
      scrollToBottom();
    }
  }, [messages, chatOpen]);

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    socketService.sendMessage(roomId, text);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!chatOpen) return null;

  const myMember = room?.members?.find((m) => m.userId === user?.id);
  const myTeam = room?.teams?.find((t) => t.id === myMember?.teamId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Background click to dismiss */}
      <div className="flex-1" onClick={() => setChatOpen(false)} />

      {/* Slide-out drawer panel */}
      <div className="w-full max-w-sm sm:max-w-md h-full bg-slate-950/95 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
        {/* Drawer Header */}
        <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>Room Messages</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                  {messages.length}
                </span>
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">Live banter with all auction managers</p>
            </div>
          </div>

          <button
            onClick={() => setChatOpen(false)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Banter Chips */}
        <div className="px-3 py-2 border-b border-slate-800/60 bg-slate-900/40 overflow-x-auto whitespace-nowrap header-rollbar flex gap-1.5 shrink-0">
          {QUICK_BANTERS.map((banter) => (
            <button
              key={banter}
              onClick={() => handleSendMessage(banter)}
              className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700/80 hover:border-amber-500/40 text-[10px] text-slate-300 hover:text-white font-medium transition-all active:scale-95 shrink-0"
            >
              {banter}
            </button>
          ))}
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4">
              <MessageSquare className="w-10 h-10 mb-2 opacity-30 text-amber-400" />
              <p className="text-xs font-bold text-slate-400">No messages yet!</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-[220px]">
                Send a quick reaction or message your fellow managers above.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.userId === user?.id;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
                >
                  {/* Sender meta */}
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    {msg.teamShortName && (
                      <span
                        className="px-1.5 py-0.2 rounded text-[9px] font-black border uppercase shadow-sm"
                        style={{
                          backgroundColor: `${msg.teamColor || '#E11D48'}20`,
                          borderColor: `${msg.teamColor || '#E11D48'}60`,
                          color: msg.teamColor || '#E11D48',
                        }}
                      >
                        {msg.teamShortName}
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-slate-300">
                      {isMe ? 'You' : msg.username}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs shadow-md break-words ${
                      isMe
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-medium rounded-tr-none'
                        : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/80">
          {myTeam && (
            <div className="flex items-center gap-1 mb-2 px-1 text-[10px] text-slate-400">
              <span className="text-slate-500">Posting as:</span>
              <span className="font-bold" style={{ color: myTeam.color }}>
                {myTeam.name} ({myTeam.shortName})
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send message to room managers..."
              className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 text-xs text-white placeholder-slate-500 outline-none transition-all"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-bold transition-all active:scale-95 shadow-md shrink-0"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

