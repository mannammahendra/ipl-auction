'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { socketService } from '../lib/socket';
import { useAuctionStore } from '../lib/store';
import {
  ArrowRight,
  Play,
  Eye,
  EyeOff,
} from 'lucide-react';
import TeamLogo from '../components/TeamLogo';

function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinCodeParam = searchParams.get('join') || '';

  const { setUser } = useAuctionStore();

  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState(joinCodeParam);
  const [roomPassword, setRoomPassword] = useState('');
  const [showJoinPassword, setShowJoinPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Create Room fields
  const [roomName, setRoomName] = useState('');
  const [startingPurseCr, setStartingPurseCr] = useState<number>(120);
  const [bidTimerSec, setBidTimerSec] = useState<number>(14);
  const [targetSquadSize, setTargetSquadSize] = useState<number>(11);
  const [maxOverseas, setMaxOverseas] = useState<number>(4);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch('/lobby');
    router.prefetch('/auction');
    if (joinCodeParam) {
      setRoomCode(joinCodeParam);
      setActiveTab('join');
    }
  }, [joinCodeParam, router]);

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) {
      setErrorMessage('Please enter an auction room code');
      return;
    }
    const finalName = displayName.trim() || `Manager_${Math.floor(100 + Math.random() * 900)}`;

    try {
      setIsLoading(true);
      setErrorMessage(null);

      // 1. Guest login
      const auth = await api.auth.guest(finalName);
      api.setToken(auth.token);
      socketService.disconnect();
      setUser(auth.user, auth.token);

      // 2. Join room
      const room = await api.rooms.join(roomCode.trim().toUpperCase(), roomPassword || undefined);

      if (room.status === 'AUCTION_ACTIVE') {
        router.push(`/auction/${room.id}`);
      } else {
        router.push(`/lobby/${room.id}`);
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        setErrorMessage(`Room "${roomCode}" was not found. Please verify the code or click "Create Room" above to host a new auction.`);
      } else {
        setErrorMessage(msg || 'Failed to join room. Please check your connection.');
      }
      setIsLoading(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = displayName.trim() || `Host_${Math.floor(100 + Math.random() * 900)}`;

    const purseCr = Number(startingPurseCr) || 120;
    if (purseCr < 1) {
      setErrorMessage('Starting purse must be at least ₹1 Crore');
      return;
    }
    const timer = Number(bidTimerSec) || 15;
    if (timer < 5 || timer > 120) {
      setErrorMessage('Bid timer must be between 5 and 120 seconds');
      return;
    }
    const squad = Number(targetSquadSize) || 11;
    if (squad < 1 || squad > 35) {
      setErrorMessage('Squad size must be between 1 and 35 players');
      return;
    }
    const overseas = Math.min(Math.max(1, Number(maxOverseas) || 4), squad);

    try {
      setIsLoading(true);
      setErrorMessage(null);

      // 1. Guest login as host
      const auth = await api.auth.guest(finalName);
      api.setToken(auth.token);
      socketService.disconnect();
      setUser(auth.user, auth.token);

      // 2. Create room with compulsory squad size and max overseas
      const room = await api.rooms.create({
        name: roomName.trim() || undefined,
        password: roomPassword.trim() || undefined,
        startingPurse: purseCr * 10000000,
        bidTimerSeconds: timer,
        squadSize: squad,
        minSquad: squad,
        maxSquad: Math.max(squad, 18),
        maxOverseas: overseas,
      });

      router.push(`/lobby/${room.id}`);
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          if (window.location.pathname !== `/lobby/${room.id}`) {
            window.location.href = `/lobby/${room.id}`;
          }
        }, 500);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create auction room. Please check your connection.');
      setIsLoading(false);
    }
  };

  const handleInstantDemo = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const auth = await api.auth.guest('Auctioneer_Pro');
      api.setToken(auth.token);
      socketService.disconnect();
      setUser(auth.user, auth.token);

      const room = await api.rooms.create({
        name: 'IPL Mega Demo Auction',
        startingPurse: 1200000000,
        bidTimerSeconds: 20,
        squadSize: 11,
        minSquad: 11,
        maxSquad: 18,
        maxOverseas: 4,
      });

      router.push(`/lobby/${room.id}`);
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          if (window.location.pathname !== `/lobby/${room.id}`) {
            window.location.href = `/lobby/${room.id}`;
          }
        }, 500);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to launch demo');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-100 flex flex-col justify-between selection:bg-amber-400 selection:text-slate-950">
      {/* Top Header */}
      <header className="px-4 sm:px-6 py-2.5 flex items-center justify-between max-w-7xl mx-auto w-full gap-3">
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-950/40 shrink-0">
            <span className="text-base sm:text-lg">🏏</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-sm sm:text-base tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-300 to-rose-400 whitespace-nowrap">
              IPL AUCTION
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest hidden xs:inline-block sm:inline-block">
              MULTIPLAYER
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleInstantDemo}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition-transform hover:scale-105 shrink-0 whitespace-nowrap"
          >
            <Play className="w-3 h-3 fill-current shrink-0" />
            <span>Quick Demo Room</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-md mx-auto px-4 py-4 sm:py-8 w-full flex-1 flex flex-col justify-center items-center">
        {/* Official Franchises Showcase */}
        <div className="w-full text-center mb-3">
          <div className="grid grid-cols-5 sm:flex sm:flex-wrap items-center justify-center gap-2 max-w-fit mx-auto">
            {['CSK', 'MI', 'RCB', 'KKR', 'SRH', 'RR', 'GT', 'LSG', 'DC', 'PBKS'].map((teamKey) => (
              <TeamLogo key={teamKey} shortName={teamKey} size="sm" />
            ))}
          </div>
        </div>

        {/* Action Card */}
        <div className="w-full">
          <div className="ios-glass-elevated p-4 sm:p-5 shadow-2xl relative">
            {/* Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl mb-3 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('join');
                  setErrorMessage(null);
                }}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                  activeTab === 'join'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Join Room
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('create');
                  setErrorMessage(null);
                }}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                  activeTab === 'create'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Room
              </button>
            </div>

            {errorMessage && (
              <div className="mb-3 p-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">
                {errorMessage}
              </div>
            )}

            {/* JOIN ROOM TAB */}
            {activeTab === 'join' && (
              <form onSubmit={handleJoinRoom} className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Your Manager Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CaptainCool"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Room Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. IPL-8492"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-amber-400 font-mono font-bold placeholder-slate-500 focus:outline-none focus:border-amber-500 uppercase tracking-wider"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Room Password (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type={showJoinPassword ? 'text' : 'password'}
                      placeholder="Leave empty if not protected"
                      value={roomPassword}
                      onChange={(e) => setRoomPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 pr-10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowJoinPassword(!showJoinPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 transition-colors"
                      title={showJoinPassword ? 'Hide password' : 'Show password'}
                    >
                      {showJoinPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition-transform hover:scale-[1.01] flex items-center justify-center gap-1.5 mt-1"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Enter Auction Room</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* CREATE ROOM TAB */}
            {activeTab === 'create' && (
              <form onSubmit={handleCreateRoom} className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Your Manager Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Host_Dhoni"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Room Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Friends Mega Auction 2026"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>



                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Room Password (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type={showCreatePassword ? 'text' : 'password'}
                      placeholder="Private room password"
                      value={roomPassword}
                      onChange={(e) => setRoomPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 pr-9 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword(!showCreatePassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 transition-colors"
                      title={showCreatePassword ? 'Hide password' : 'Show password'}
                    >
                      {showCreatePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition-transform hover:scale-[1.01] flex items-center justify-center gap-1.5 mt-1"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Create Auction Room</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Instant Demo Auction Quick Action */}
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-center">
              <button
                type="button"
                onClick={handleInstantDemo}
                disabled={isLoading}
                className="w-full py-2 px-3 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-amber-500/30 text-amber-300 font-bold text-xs tracking-wider transition-colors flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                <span>⚡ Play Instant Demo Room (Solo vs AI)</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-3 text-center text-xs text-slate-500">
        IPL Mega Auction Multiplayer Engine &bull; Built with NestJS & Next.js &bull; Server-Authoritative
      </footer>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#090d16]" />}>
      <LandingContent />
    </Suspense>
  );
}

