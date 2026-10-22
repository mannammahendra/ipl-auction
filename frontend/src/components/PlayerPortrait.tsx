'use client';

import React, { useState, useEffect } from 'react';
import { getPlayerPhoto, PLAYER_PHOTOS } from '../lib/playerPhotos';

interface PlayerPortraitProps {
  player?: {
    id?: string | null;
    name?: string | null;
    image?: string | null;
    role?: string | null;
  } | null;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

// Inline SVG neutral silhouette placeholder (offline-resilient, no network dependency)
const NEUTRAL_SILHOUETTE_DATA_URI =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" fill="%23475569"><path d="M50 15a22 22 0 1 0 0 44 22 22 0 0 0 0-44zm0 54c-28 0-45 16-45 36v15h90v-15c0-20-17-36-45-36z"/></svg>';

export function PlayerPortrait({
  player,
  className = 'w-28 h-36 sm:w-32 sm:h-40',
  imageClassName = '',
  priority = false,
}: PlayerPortraitProps) {
  const photoUrl = getPlayerPhoto(player);
  const [currentSrc, setCurrentSrc] = useState<string>(photoUrl);
  const [hasTriedCurated, setHasTriedCurated] = useState(false);
  const [hasTriedFallbackAvatar, setHasTriedFallbackAvatar] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const playerName = player?.name || 'Player';
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    playerName
  )}&background=0f172a&color=f8fafc&size=256&bold=true`;

  // Always reset image state when player changes so previous player errors don't stick
  useEffect(() => {
    setCurrentSrc(photoUrl);
    setHasTriedCurated(false);
    setHasTriedFallbackAvatar(false);
    setIsLoaded(false);
  }, [player?.name, player?.image, photoUrl]);

  const handleImageError = () => {
    // 1. If external/db image failed, try curated PLAYER_PHOTOS mapping first
    const curated = player?.name ? PLAYER_PHOTOS[player.name] : null;
    if (curated && !hasTriedCurated && curated !== currentSrc) {
      setHasTriedCurated(true);
      setCurrentSrc(curated);
      return;
    }

    // 2. Otherwise try avatar initials
    if (!hasTriedFallbackAvatar && currentSrc !== fallbackAvatar) {
      setHasTriedFallbackAvatar(true);
      setCurrentSrc(fallbackAvatar);
      return;
    }

    // 3. Ultimate fail-safe: neutral silhouette SVG (guaranteed never to loop or break)
    if (currentSrc !== NEUTRAL_SILHOUETTE_DATA_URI) {
      setCurrentSrc(NEUTRAL_SILHOUETTE_DATA_URI);
    }
  };

  const defaultRounding = className.includes('rounded-') ? '' : 'rounded-2xl';

  return (
    <div
      className={`relative overflow-hidden ${defaultRounding} border border-slate-700/80 bg-slate-900 flex items-center justify-center shadow-xl select-none shrink-0 ${className}`}
    >
      <img
        src={currentSrc}
        alt={playerName}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onLoad={() => setIsLoaded(true)}
        onError={handleImageError}
        className={`w-full h-full object-cover object-[center_top] transition-all duration-300 hover:scale-105 rounded-[inherit] ${
          isLoaded ? 'opacity-100' : 'opacity-80'
        } ${imageClassName}`}
      />
    </div>
  );
}
