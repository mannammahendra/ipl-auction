const CLOUD_BACKEND_URL = 'https://ipl-auction-backend-8t5h.onrender.com';

function getCandidateUrls(endpoint: string): string[] {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const candidates: string[] = [];

  const isBrowser = typeof window !== 'undefined';
  const isLocalHost = isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocalHost) {
    // Local dev: try localhost port 4000 first, then relative Next.js proxy
    candidates.push(`http://localhost:4000${normalizedEndpoint}`);
    candidates.push(normalizedEndpoint);
    return candidates;
  }

  // Production Cloud / Mobile App:
  // 1. Direct Cloud Backend
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    candidates.push(`${envUrl.replace(/\/$/, '')}${normalizedEndpoint}`);
  }
  candidates.push(`${CLOUD_BACKEND_URL}${normalizedEndpoint}`);

  // 2. Relative Next.js rewrite proxy (/api/...) as cloud fallback
  if (isBrowser) {
    candidates.push(normalizedEndpoint);
  }

  return Array.from(new Set(candidates));
}

class ApiClient {
  private memoryToken: string | null = null;

  getToken(): string | null {
    if (this.memoryToken) return this.memoryToken;
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem('ipl_auction_token');
    } catch {
      return null;
    }
  }

  setToken(token: string) {
    this.memoryToken = token;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ipl_auction_token', token);
      } catch (err) {
        console.warn('localStorage access failed:', err);
      }
    }
  }

  clearToken() {
    this.memoryToken = null;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('ipl_auction_token');
      } catch (err) {
        console.warn('localStorage clear failed:', err);
      }
    }
  }

  /**
   * Proactively ping backend to wake up cloud instance from sleep
   */
  async warmup(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      await fetch(`${CLOUD_BACKEND_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);
    } catch {
      // Non-critical background warmup
    }
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const candidateUrls = getCandidateUrls(endpoint);
    let lastError: Error | null = null;

    // Retry loop: 2 passes across candidate URLs (allows waking up sleeping Render containers)
    for (let pass = 0; pass < 2; pass++) {
      for (const targetUrl of candidateUrls) {
        let res: Response;
        try {
          const controller = new AbortController();
          // Allow 25 seconds for cold start spin-up on Render free tier
          const timeoutId = setTimeout(() => controller.abort(), 25000);
          res = await fetch(targetUrl, {
            ...options,
            headers,
            signal: options.signal || controller.signal,
          });
          clearTimeout(timeoutId);

          // If Render returned 502/503 (container still spinning up), treat as retryable
          if (res.status === 502 || res.status === 503) {
            lastError = new Error('Cloud auction server is waking up...');
            continue;
          }

          const data = await res.json().catch(() => null);
          if (!res.ok) {
            throw new Error(data?.message || `Request failed with status ${res.status}`);
          }

          return data as T;
        } catch (err: any) {
          lastError = err;
          // Continue to next candidate URL
        }
      }

      // Small pause before second pass if server is waking up
      if (pass === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    // Friendly, accurate cloud message with zero misleading local Wi-Fi advice
    throw new Error(
      lastError?.message && !lastError.message.includes('fetch') && !lastError.message.includes('abort')
        ? lastError.message
        : 'Unable to connect to the IPL Auction cloud server. The server may be waking up from standby—please try again in a few moments.'
    );
  }

  auth = {
    guest: (displayName: string) =>
      this.request<{ user: any; token: string }>('/api/auth/guest', {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      }),

    login: (username: string, password?: string) =>
      this.request<{ user: any; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),

    register: (username: string, email?: string, password?: string) =>
      this.request<{ user: any; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),

    me: () => this.request<any>('/api/auth/me'),
  };

  rooms = {
    create: (options: {
      name?: string;
      password?: string;
      startingPurse?: number;
      squadSize?: number;
      minSquad?: number;
      maxSquad?: number;
      maxOverseas?: number;
      bidTimerSeconds?: number;
      snipeExtensionSeconds?: number;
    }) =>
      this.request<any>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(options),
      }),

    join: (code: string, password?: string) =>
      this.request<any>('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ code, password }),
      }),

    get: (idOrCode: string) => this.request<any>(`/api/rooms/${idOrCode}`),

    selectTeam: (roomId: string, teamId: string, managerName?: string) =>
      this.request<any>(`/api/rooms/${roomId}/select-team`, {
        method: 'POST',
        body: JSON.stringify({ teamId, managerName }),
      }),

    updateSettings: (roomId: string, settings: any) =>
      this.request<any>(`/api/rooms/${roomId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),

    toggleReady: (roomId: string) =>
      this.request<any>(`/api/rooms/${roomId}/ready`, {
        method: 'POST',
      }),
  };

  auction = {
    start: (roomId: string) =>
      this.request<any>(`/api/auction/${roomId}/start`, {
        method: 'POST',
      }),
    end: (roomId: string) =>
      this.request<any>(`/api/auction/${roomId}/end`, {
        method: 'POST',
      }),
    pause: (roomId: string) =>
      this.request<any>(`/api/auction/${roomId}/pause`, {
        method: 'POST',
      }),
    resume: (roomId: string) =>
      this.request<any>(`/api/auction/${roomId}/resume`, {
        method: 'POST',
      }),
    skip: (roomId: string) =>
      this.request<any>(`/api/auction/${roomId}/skip`, {
        method: 'POST',
      }),
    undo: (roomId: string) =>
      this.request<any>(`/api/auction/${roomId}/undo`, {
        method: 'POST',
      }),
    setSpeed: (roomId: string, speedMultiplier?: number) =>
      this.request<any>(`/api/auction/${roomId}/speed`, {
        method: 'POST',
        body: JSON.stringify({ speedMultiplier }),
      }),
    getAuditLogs: (roomId: string) => this.request<any[]>(`/api/auction/${roomId}/audit-logs`),
    getBids: (roomId: string, auctionPlayerId: string) =>
      this.request<any[]>(`/api/auction/${roomId}/bids/${auctionPlayerId}`),
  };

  players = {
    getAll: (params?: { role?: string; tier?: string; overseas?: boolean; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.role) query.set('role', params.role);
      if (params?.tier) query.set('tier', params.tier);
      if (params?.overseas !== undefined) query.set('overseas', String(params.overseas));
      if (params?.search) query.set('search', params.search);
      return this.request<any[]>(`/api/players?${query.toString()}`);
    },
  };
}

export const api = new ApiClient();

