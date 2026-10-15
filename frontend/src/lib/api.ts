function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    // In browser: return empty string so requests use relative path through Next.js proxy (/api/...)
    // This avoids cross-origin blocking, separate port firewall issues, and connection hangs on mobile!
    return '';
  }
  return process.env.INTERNAL_API_URL || 'http://localhost:4000';
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

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = getBaseUrl();
    const targetUrl = `${baseUrl}${endpoint}`;

    let res: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      res = await fetch(targetUrl, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err: any) {
      // If relative fetch encounters an issue in browser, try direct backend port 4000 as fallback
      if (typeof window !== 'undefined' && !targetUrl.includes(':4000')) {
        try {
          const directUrl = `${window.location.protocol}//${window.location.hostname}:4000${endpoint}`;
          const fallbackController = new AbortController();
          const fallbackTimeout = setTimeout(() => fallbackController.abort(), 10000);
          res = await fetch(directUrl, {
            ...options,
            headers,
            signal: options.signal || fallbackController.signal,
          });
          clearTimeout(fallbackTimeout);
        } catch {
          throw new Error('Unable to connect to the auction server. Please ensure the backend is running and your device is on the same Wi-Fi network.');
        }
      } else {
        throw new Error('Unable to connect to the auction server. Please ensure the backend is running.');
      }
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.message || `Request failed with status ${res.status}`);
    }

    return data as T;
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

