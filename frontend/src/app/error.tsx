'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('IPL Auction Client Error Boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl backdrop-blur-xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-white mb-2">Connecting to Auction Arena...</h2>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          {error?.message || 'A temporary display error occurred. Click reload to refresh the room state.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={() => reset()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Arena</span>
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/';
              } else {
                router.push('/');
              }
            }}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return Home</span>
          </button>
        </div>
      </div>
    </div>
  );
}
