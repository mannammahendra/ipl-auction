'use client';

import { useAuctionStore } from '../lib/store';
import { formatRupees } from '../lib/formatters';
import { X, Activity, Clock } from 'lucide-react';
import TeamLogo from './TeamLogo';

interface BidHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BidHistoryModal({ isOpen, onClose }: BidHistoryModalProps) {
  const { currentBids, currentAuctionPlayer } = useAuctionStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="relative w-full max-w-lg max-h-[85vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide">
                Live Bid History
              </h2>
              <p className="text-xs text-slate-400">
                {currentAuctionPlayer
                  ? `Bids placed for ${currentAuctionPlayer.player.name} (#LOT ${currentAuctionPlayer.lotNumber})`
                  : 'Recent gavel activity in this room'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2">
          {currentBids.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-bold text-slate-400">No Bids Yet</p>
              <p className="text-xs text-slate-500 mt-1">
                When franchises bid on this player, bids will appear here in real-time.
              </p>
            </div>
          ) : (
            currentBids.map((bid, index) => {
              const isLatest = index === 0;
              return (
                <div
                  key={bid.id || `${bid.amount}-${index}`}
                  className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                    isLatest
                      ? 'bg-amber-500/15 border-amber-500/60 shadow-md ring-1 ring-amber-500/30'
                      : 'bg-slate-950/50 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <TeamLogo
                      logo={bid.team?.logo}
                      name={bid.team?.name}
                      shortName={bid.team?.shortName}
                      size="sm"
                    />
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="font-extrabold">{bid.bidder?.username || 'Manager'}</span>
                        <span
                          className="px-1.5 py-0.2 rounded font-black text-[10px] uppercase border"
                          style={{
                            backgroundColor: `${bid.team?.color || '#cbd5e1'}20`,
                            borderColor: `${bid.team?.color || '#cbd5e1'}50`,
                            color: bid.team?.color || '#cbd5e1',
                          }}
                        >
                          ({bid.team?.shortName || bid.team?.name?.slice(0, 3)})
                        </span>
                        {isLatest && (
                          <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 uppercase tracking-widest animate-pulse">
                            LEADING
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {bid.team?.name || 'Franchise'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-mono text-base font-black ${
                        isLatest ? 'text-amber-400' : 'text-slate-200'
                      }`}
                    >
                      {formatRupees(bid.amount)}
                    </span>
                    <span className="block text-[10px] text-slate-500 font-mono">
                      Bid #{bid.bidNumber || currentBids.length - index}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-xs text-slate-400">
          <span>
            Total Bids Placed: <strong className="text-white">{currentBids.length}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
