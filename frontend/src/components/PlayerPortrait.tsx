'use client';

import React, { useState, useEffect } from 'react';
import { getPlayerPhoto, PLAYER_PHOTOS } from '../lib/playerPhotos';

interface PlayerPortraitProps {
  player: {
    name: string;
    image?: string | null;
    role?: string;
  };
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

export function PlayerPortrait({
  player,
  className = 'w-28 h-36 sm:w-32 sm:h-40',
  imageClassName = '',
  priority = false,
}: PlayerPortraitProps) {
  const photoUrl = getPlayerPhoto(player);
  const [currentSrc, setCurrentSrc] = useState<string>(photoUrl);
  const [hasTriedCurated, setHasTriedCurated] = useState(false);

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    player.name || 'Player'
  )}&background=0f172a&color=f8fafc&size=256&bold=true`;

  // Always reset image state when player changes so previous player errors don't stick
  useEffect(() => {
    setCurrentSrc(photoUrl);
    setHasTriedCurated(false);
  }, [player.name, player.image, photoUrl]);

  const handleImageError = () => {
    // If external/db image failed, try curated PLAYER_PHOTOS mapping first
    const curated = PLAYER_PHOTOS[player.name];
    if (curated && !hasTriedCurated && curated !== currentSrc) {
      setHasTriedCurated(true);
      setCurrentSrc(curated);
      return;
    }

    // Otherwise fall back to avatar initials
    setCurrentSrc(fallbackAvatar);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 flex items-center justify-center shadow-xl select-none shrink-0 ${className}`}
    >
      <img
        src={currentSrc}
        alt={player.name}
        loading={priority ? 'eager' : 'lazy'}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={handleImageError}
        className={`w-full h-full object-cover object-[center_top] transition-transform duration-300 hover:scale-105 rounded-2xl ${imageClassName}`}
      />
    </div>
  );
}
