import { io, Socket } from 'socket.io-client';

function getSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('onrender.com')) {
      return 'https://ipl-auction-backend-8t5h.onrender.com';
    }
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${host}:4000`;
  }
  return 'https://ipl-auction-backend-8t5h.onrender.com';
}

class SocketService {
  private socket: Socket | null = null;
  private currentRoomId: string | null = null;
  private currentToken: string | null = null;

  connect(token: string): Socket {
    if (this.socket && this.socket.connected && this.currentToken === token) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentToken = token;
    this.socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 500,
    });

    this.socket.on('connect', () => {
      console.log('⚡ Connected to IPL Auction WebSocket Server');
      if (this.currentRoomId) {
        this.joinRoom(this.currentRoomId);
      }
    });

    this.socket.on('connect_error', (err) => {
      console.warn('Socket connect error on primary URL:', err.message);
      if (typeof window !== 'undefined' && getSocketUrl().includes(':4000')) {
        const fallbackUrl = window.location.origin;
        if (this.socket && (this.socket as any).io?.uri !== fallbackUrl) {
          console.log('Falling back to origin proxy socket URL:', fallbackUrl);
          this.socket.disconnect();
          this.socket = io(fallbackUrl, {
            auth: { token },
            transports: ['polling', 'websocket'],
            reconnection: true,
          });
          this.socket.on('connect', () => {
            console.log('⚡ Connected via proxy WebSocket');
            if (this.currentRoomId) this.joinRoom(this.currentRoomId);
          });
        }
      }
    });

    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  joinRoom(roomId: string) {
    this.currentRoomId = roomId;
    if (this.socket) {
      this.socket.emit('join_room', { roomId });
    }
  }

  placeBid(roomId: string, teamId: string, amount?: number) {
    if (this.socket) {
      this.socket.emit('place_bid', { roomId, teamId, amount });
    }
  }

  startAuction(roomId: string) {
    if (this.socket) {
      this.socket.emit('start_auction', { roomId });
    }
  }

  nominatePlayer(roomId: string, auctionPlayerId: string) {
    if (this.socket) {
      this.socket.emit('nominate_player', { roomId, auctionPlayerId });
    }
  }

  nominateNextPlayer(roomId: string) {
    if (this.socket) {
      this.socket.emit('nominate_next', { roomId });
    }
  }

  notifyTimerExpired(roomId: string, lotId?: string) {
    if (this.socket) {
      this.socket.emit('timer_expired', { roomId, lotId });
    }
  }

  pauseAuction(roomId: string) {
    if (this.socket) {
      this.socket.emit('pause_auction', { roomId });
    }
  }

  resumeAuction(roomId: string) {
    if (this.socket) {
      this.socket.emit('resume_auction', { roomId });
    }
  }

  sellNow(roomId: string) {
    if (this.socket) {
      this.socket.emit('sell_now', { roomId });
    }
  }

  markUnsold(roomId: string) {
    if (this.socket) {
      this.socket.emit('mark_unsold', { roomId });
    }
  }

  skipPlayer(roomId: string) {
    if (this.socket) {
      this.socket.emit('skip_player', { roomId });
    }
  }

  undoAction(roomId: string) {
    if (this.socket) {
      this.socket.emit('undo_action', { roomId });
    }
  }

  endAuction(roomId: string) {
    if (this.socket) {
      this.socket.emit('end_auction', { roomId });
    }
  }

  startAcceleratedRound(roomId: string, timerSeconds = 15) {
    if (this.socket) {
      this.socket.emit('start_accelerated_round', { roomId, timerSeconds });
    }
  }

  setAuctionSpeed(roomId: string, speedMultiplier?: number) {
    if (this.socket) {
      this.socket.emit('set_auction_speed', { roomId, speedMultiplier });
    }
  }

  selectTeam(roomId: string, teamId: string, managerName?: string) {
    if (this.socket) {
      this.socket.emit('select_team', { roomId, teamId, managerName });
    }
  }

  recallPlayer(roomId: string, auctionPlayerId: string) {
    if (this.socket) {
      this.socket.emit('recall_player', { roomId, auctionPlayerId });
    }
  }

  sendMessage(roomId: string, text: string) {
    if (this.socket) {
      this.socket.emit('send_message', { roomId, text });
    }
  }

  joinVoice(roomId: string) {
    if (this.socket) {
      this.socket.emit('voice_join', { roomId });
    }
  }

  leaveVoice(roomId: string) {
    if (this.socket) {
      this.socket.emit('voice_leave', { roomId });
    }
  }

  sendVoiceSignal(toSocketId: string, signal: any) {
    if (this.socket) {
      this.socket.emit('voice_signal', { toSocketId, signal });
    }
  }

  setVoiceState(roomId: string, state: { isMuted?: boolean; isSpeaking?: boolean }) {
    if (this.socket) {
      this.socket.emit('voice_state', { roomId, ...state });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
    this.currentRoomId = null;
  }
}

export const socketService = new SocketService();

