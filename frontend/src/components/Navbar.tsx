'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuctionStore } from '../lib/store';
import { Copy, Check, Trophy } from 'lucide-react';
import { formatRupees } from '../lib/formatters';

import TeamLogo from './TeamLogo';

export function Navbar({ onOpenSquads }: { onOpenSquads?: () => void }) {
  const { user, room } = useAuctionStore();
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (room?.code) {
      navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const myMember = room?.members?.find((m) => m.userId === user?.id);
  const myTeam = room?.teams?.find((t) => t.id === myMember?.teamId);

  return (
    <header className="sticky top-1 z-40 px-3 sm:px-6 mb-1.5">
      <div className="max-w-7xl mx-auto ios-glass rounded-xl px-3 sm:px-4 py-1.5 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-md shadow-rose-950/40 group-hover:scale-105 transition-transform">
            <span className="text-sm">🏏</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-xs md:text-sm tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-300 to-rose-400">
                IPL AUCTION
              </span>
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest">
                LIVE
              </span>
            </div>
          </div>
        </Link>

        {room && (
          <div className="flex items-center gap-2 md:gap-2.5">
            <button
              onClick={handleCopyCode}
              title="Click to copy room code"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-white/10 hover:border-amber-500/50 text-slate-200 transition-colors text-[11px] font-mono"
            >
              <span className="text-slate-400 text-[9px]">ROOM:</span>
              <span className="font-bold text-amber-400">{room.code}</span>
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
            </button>

            {myTeam && (
              <div
                className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium shadow-sm backdrop-blur-md"
                style={{
                  backgroundColor: `${myTeam.color}18`,
                  borderColor: `${myTeam.color}50`,
                  color: myTeam.color,
                }}
              >
                <TeamLogo logo={myTeam.logo} name={myTeam.name} shortName={myTeam.shortName} size="xs" />
                <span className="font-bold">{myTeam.shortName}</span>
                <span className="text-slate-300 text-[10px] font-mono">({formatRupees(myTeam.currentPurse)})</span>
              </div>
            )}

            {onOpenSquads && (
              <button
                onClick={onOpenSquads}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium text-slate-200 transition-colors"
              >
                <Trophy className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Squads</span>
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-200">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-slate-300 hidden md:inline max-w-[100px] truncate">
                {user.username}
              </span>
            </div>
          ) : (
            <Link
              href="/"
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
