'use client';

import React, { useRef, useState } from 'react';
import { useAuctionStore, Team, SquadMember } from '../lib/store';
import TeamLogo from './TeamLogo';
import {
  Download,
  Share2,
  FileSpreadsheet,
  Check,
  X,
  Trophy,
} from 'lucide-react';
import { formatRupeesCompact } from './PurseRadarModal';
import { PlayerPortrait } from './PlayerPortrait';

interface SquadPosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
}

export const SquadPosterModal: React.FC<SquadPosterModalProps> = ({
  isOpen,
  onClose,
  team,
}) => {
  const { room } = useAuctionStore();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const squad: SquadMember[] = React.useMemo(() => {
    if (!team || !room) return [];
    const list: SquadMember[] = [];
    const seen = new Set<string>();

    if (team.squad && Array.isArray(team.squad)) {
      team.squad.forEach((m) => {
        const idKey = m.playerId || m.player?.id || m.id;
        if (idKey && !seen.has(idKey)) {
          seen.add(idKey);
          list.push(m);
        }
      });
    }

    if (room.auctionPlayers && Array.isArray(room.auctionPlayers)) {
      room.auctionPlayers
        .filter((ap) => ap.status === 'SOLD' && ap.soldToTeamId === team.id)
        .forEach((ap) => {
          const idKey = ap.playerId || ap.player?.id || ap.id;
          if (idKey && !seen.has(idKey)) {
            seen.add(idKey);
            list.push({
              id: `squad_${ap.id}`,
              teamId: team.id,
              playerId: ap.playerId,
              purchasePrice: ap.soldPrice || ap.player?.basePrice || 0,
              player: ap.player,
              purchasedAt: (ap as any).soldAt ? new Date((ap as any).soldAt).toISOString() : new Date().toISOString(),
            });
          }
        });
    }

    return list;
  }, [team, room?.auctionPlayers]);

  if (!isOpen || !team || !room) return null;

  const totalSpent = (team.initialPurse || 1200000000) - team.currentPurse;
  const overseasCount = squad.filter((s) => s.player?.isOverseas).length;

  // 1. Copy WhatsApp / Discord text
  const handleCopyText = () => {
    let text = `🏏 ${team.name.toUpperCase()} (${team.shortName}) - IPL 2025 SQUAD 🏏\n`;
    text += `💰 Total Spent: ${formatRupeesCompact(totalSpent)} | Remaining Purse: ${formatRupeesCompact(team.currentPurse)}\n`;
    text += `👥 Squad Size: ${squad.length} Players (${overseasCount} Overseas ✈️)\n\n`;
    text += `📋 ACQUIRED SQUAD:\n`;

    squad.forEach((m, idx) => {
      const p = m.player;
      const osTag = p?.isOverseas ? '✈️' : '🇮🇳';
      const price = formatRupeesCompact(m.purchasePrice);
      text += `${idx + 1}. ${p?.name} (${p?.role?.replace('_', ' ')} ${osTag}) - ${price}\n`;
    });

    text += `\n⚡ IPL Mega Auction Engine`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // 2. Export CSV
  const handleExportCSV = () => {
    const headers = ['Slot', 'Player Name', 'Role', 'Country', 'Overseas', 'Purchase Price'];
    const rows = squad.map((m, idx) => [
      idx + 1,
      `"${m.player?.name}"`,
      m.player?.role,
      `"${m.player?.country}"`,
      m.player?.isOverseas ? 'Yes' : 'No',
      m.purchasePrice,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${team.shortName}_IPL_Squad.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Generate high-res poster on HTML5 Canvas
  const handleDownloadPoster = () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      const width = 1200;
      const height = 800;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setDownloading(false);
        return;
      }

      // Background Gradient
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Franchise Glow
      const glow = ctx.createRadialGradient(250, 150, 10, 250, 150, 400);
      glow.addColorStop(0, `${team.color || '#f59e0b'}33`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // Header Banner
      ctx.fillStyle = team.color || '#f59e0b';
      ctx.fillRect(50, 40, 10, 70);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 36px sans-serif';
      ctx.fillText(team.name.toUpperCase(), 75, 78);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 16px sans-serif';
      ctx.fillText(`OFFICIAL IPL MEGA AUCTION SQUAD • ${room.name}`, 75, 104);

      // Financial Summary Box
      ctx.fillStyle = '#1e293b80';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(width - 450, 40, 400, 75, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 12px sans-serif';
      ctx.fillText('TOTAL SPENT', width - 430, 68);
      ctx.fillText('REMAINING PURSE', width - 260, 68);

      ctx.fillStyle = '#facc15';
      ctx.font = '800 20px monospace';
      ctx.fillText(formatRupeesCompact(totalSpent), width - 430, 96);

      ctx.fillStyle = '#34d399';
      ctx.fillText(formatRupeesCompact(team.currentPurse), width - 260, 96);

      // Squad Cards Grid
      const startX = 50;
      const startY = 150;
      const cols = 4;
      const cardW = 260;
      const cardH = 75;
      const gapX = 20;
      const gapY = 16;

      const displaySquad = squad.slice(0, 24);

      displaySquad.forEach((member, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (cardW + gapX);
        const y = startY + row * (cardH + gapY);

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = member.player?.isOverseas ? '#38bdf860' : '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, cardW, cardH, 8);
        ctx.fill();
        ctx.stroke();

        // Player Name
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 14px sans-serif';
        const name = member.player?.name || 'Player';
        ctx.fillText(name.length > 20 ? name.substring(0, 18) + '...' : name, x + 14, y + 28);

        // Role & Overseas
        ctx.fillStyle = member.player?.isOverseas ? '#38bdf8' : '#94a3b8';
        ctx.font = '600 11px sans-serif';
        const role = `${member.player?.role?.replace('_', ' ') || ''}${member.player?.isOverseas ? ' • Overseas' : ''}`;
        ctx.fillText(role, x + 14, y + 46);

        // Purchase Price
        ctx.fillStyle = '#34d399';
        ctx.font = '800 13px monospace';
        ctx.fillText(formatRupeesCompact(member.purchasePrice), x + 14, y + 64);
      });

      // Footer
      ctx.fillStyle = '#64748b';
      ctx.font = '500 12px sans-serif';
      ctx.fillText(`Squad Size: ${squad.length} players • Generated by IPL Mega Auction Live Arena`, 50, height - 30);

      // Download Trigger
      const imageUri = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = imageUri;
      downloadLink.download = `${team.shortName}_IPL_Squad_Poster.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (e) {
      console.error('Error generating squad poster:', e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header with Actions */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <TeamLogo logo={team.logo} name={team.name} shortName={team.shortName} size="xs" />
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>{team.name} Official Squad Poster</span>
              </h2>
              <p className="text-[10px] text-slate-400">
                Shareable roster card, graphic poster, and data export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyText}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-all active:scale-95"
              title="Copy formatted squad roster for WhatsApp / Discord"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-amber-400" />}
              <span>{copied ? 'Copied!' : 'Share'}</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-all active:scale-95"
              title="Download CSV spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>

            <button
              onClick={handleDownloadPoster}
              disabled={downloading}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black tracking-wider transition-all active:scale-95 shadow-md"
              title="Download high-resolution image poster"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Rendering...' : 'Poster (.PNG)'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Poster Preview Frame */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            ref={posterRef}
            className="rounded-2xl border-2 p-5 relative overflow-hidden shadow-2xl"
            style={{
              borderColor: `${team.color || '#f59e0b'}60`,
              background: `radial-gradient(circle at top right, ${team.color || '#f59e0b'}18, #090d16 60%)`,
            }}
          >
            {/* Poster Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <TeamLogo logo={team.logo} name={team.name} shortName={team.shortName} size="md" />
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest block text-amber-400">
                    Official Franchise Roster
                  </span>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {team.name}
                  </h1>
                  <span className="text-xs text-slate-400 font-medium">
                    {room.name} &bull; Season 2025
                  </span>
                </div>
              </div>

              {/* Financial Snapshot */}
              <div className="flex items-center gap-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-500 block">Total Spent</span>
                  <span className="text-xs font-black text-amber-300 font-mono">
                    {formatRupeesCompact(totalSpent)}
                  </span>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-500 block">Remaining</span>
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    {formatRupeesCompact(team.currentPurse)}
                  </span>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-500 block">Squad</span>
                  <span className="text-xs font-black text-white font-mono">
                    {squad.length} ({overseasCount} ✈️)
                  </span>
                </div>
              </div>
            </div>

            {/* Squad Members Cards Grid */}
            <div className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider">
                  Acquired Players ({squad.length})
                </h4>
                <span className="text-[10px] text-slate-400">
                  {room.minSquad - squad.length > 0
                    ? `${room.minSquad - squad.length} slots needed to meet minimum squad`
                    : 'Full minimum squad satisfied'}
                </span>
              </div>

              {squad.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30 text-amber-400" />
                  <p className="text-xs font-bold text-slate-400">No players acquired yet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Bid on players in the live auction arena to build this roster!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {squad.map((member, idx) => {
                    const p = member.player;

                    return (
                      <div
                        key={member.id || idx}
                        className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-colors shadow-sm"
                      >
                        <PlayerPortrait player={p} className="w-9 h-9 rounded-lg" />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-white truncate">
                              {p?.name}
                            </span>
                            {p?.isOverseas && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold shrink-0">
                                ✈️ OS
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5 font-mono">
                            <span className="capitalize">{p?.role?.replace('_', ' ').toLowerCase()}</span>
                            <span className="font-bold text-emerald-400">
                              {formatRupeesCompact(member.purchasePrice)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
