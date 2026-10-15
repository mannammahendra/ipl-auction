'use client';

import { TEAM_BASE64_LOGOS } from './teamLogosData';

interface TeamLogoProps {
  logo?: string;
  name?: string;
  shortName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
}

const IPL_TEAM_COLORS: Record<string, string> = {
  CSK: '#FACC15',
  MI: '#0284C7',
  RCB: '#DC2626',
  KKR: '#7C3AED',
  SRH: '#EA580C',
  RR: '#EC4899',
  GT: '#1E3A8A',
  LSG: '#06B6D4',
  DC: '#2563EB',
  PBKS: '#E11D48',
};

const SIZE_MAP: Record<string, { box: string; img: string; text: string }> = {
  xs: { box: 'w-6 h-6', img: 'max-h-5 max-w-5', text: 'text-[9px]' },
  sm: { box: 'w-8 h-8', img: 'max-h-7 max-w-7', text: 'text-[11px]' },
  md: { box: 'w-10 h-10', img: 'max-h-9 max-w-9', text: 'text-xs' },
  lg: { box: 'w-14 h-14', img: 'max-h-12 max-w-12', text: 'text-sm' },
  xl: { box: 'w-16 h-16', img: 'max-h-14 max-w-14', text: 'text-base' },
};

function normalizeTeamKey(shortName?: string, name?: string, logo?: string): string {
  const candidates = [shortName, name, logo];
  for (const c of candidates) {
    if (!c) continue;
    const clean = c.toUpperCase().trim();
    if (IPL_TEAM_COLORS[clean]) return clean;

    if (clean.includes('CHENNAI') || clean.includes('SUPER KINGS') || clean === 'CSK') return 'CSK';
    if (clean.includes('MUMBAI') || clean.includes('INDIANS') || clean === 'MI') return 'MI';
    if (clean.includes('BENGALURU') || clean.includes('BANGALORE') || clean === 'RCB') return 'RCB';
    if (clean.includes('KOLKATA') || clean.includes('KNIGHT') || clean === 'KKR') return 'KKR';
    if (clean.includes('HYDERABAD') || clean.includes('SUNRISERS') || clean === 'SRH') return 'SRH';
    if (clean.includes('RAJASTHAN') || clean.includes('ROYALS') || clean === 'RR') return 'RR';
    if (clean.includes('GUJARAT') || clean.includes('TITANS') || clean === 'GT') return 'GT';
    if (clean.includes('LUCKNOW') || clean.includes('GIANTS') || clean === 'LSG') return 'LSG';
    if (clean.includes('DELHI') || clean.includes('CAPITALS') || clean === 'DC') return 'DC';
    if (clean.includes('PUNJAB') || clean.includes('KINGS') || clean === 'PBKS') return 'PBKS';

    if (c.toLowerCase().includes('csk')) return 'CSK';
    if (c.toLowerCase().includes('mi')) return 'MI';
    if (c.toLowerCase().includes('rcb')) return 'RCB';
    if (c.toLowerCase().includes('kkr')) return 'KKR';
    if (c.toLowerCase().includes('srh')) return 'SRH';
    if (c.toLowerCase().includes('rr')) return 'RR';
    if (c.toLowerCase().includes('gt')) return 'GT';
    if (c.toLowerCase().includes('lsg')) return 'LSG';
    if (c.toLowerCase().includes('dc')) return 'DC';
    if (c.toLowerCase().includes('pbks')) return 'PBKS';
  }
  return 'IPL';
}

export default function TeamLogo({
  logo,
  name = 'Team',
  shortName = '',
  size = 'md',
  className = '',
}: TeamLogoProps) {
  const teamKey = normalizeTeamKey(shortName, name, logo);
  const color = IPL_TEAM_COLORS[teamKey] || '#f59e0b';
  const logoSrc = (logo && (logo.startsWith('data:') || logo.startsWith('http') || logo.startsWith('/')))
    ? logo
    : TEAM_BASE64_LOGOS[teamKey] || `/logos/${teamKey.toLowerCase()}.png`;

  const safeShort =
    shortName && !shortName.includes('/') && !shortName.includes('.')
      ? shortName.slice(0, 4).toUpperCase()
      : teamKey;
  const sizeConfig = typeof size === 'string' ? SIZE_MAP[size] || SIZE_MAP.md : null;

  if (sizeConfig) {
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 rounded-2xl overflow-hidden bg-white/95 p-1 shadow-md border border-white/20 ${sizeConfig.box} ${className}`}
        style={{ borderColor: `${color}60` }}
        title={name}
      >
        <img
          src={logoSrc}
          alt={name || safeShort}
          className={`object-contain transition-transform duration-200 hover:scale-105 ${sizeConfig.img}`}
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  const px = typeof size === 'number' ? size : 40;
  return (
    <div
      style={{
        width: `${px}px`,
        height: `${px}px`,
        borderColor: `${color}60`,
      }}
      className={`relative inline-flex items-center justify-center shrink-0 rounded-2xl overflow-hidden bg-white/95 p-1 shadow-md border border-white/20 ${className}`}
      title={name}
    >
      <img
        src={logoSrc}
        alt={name || safeShort}
        style={{ maxWidth: `${Math.round(px * 0.85)}px`, maxHeight: `${Math.round(px * 0.85)}px` }}
        className="object-contain"
        onError={(e) => {
          (e.target as HTMLElement).style.display = 'none';
        }}
      />
    </div>
  );
}
