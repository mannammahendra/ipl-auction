import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuctionGateway } from '../src/auction/auction.gateway.js';

describe('Microphone Voice Chat WebRTC Signaling & State Suite', () => {
  let gateway: AuctionGateway;
  let mockJwtService: any;
  let mockAuctionEngine: any;
  let mockPrisma: any;
  let mockRoomsService: any;
  let mockServer: any;

  beforeEach(() => {
    mockJwtService = {
      verify: vi.fn(),
    };
    mockAuctionEngine = {
      getTimerState: vi.fn().mockReturnValue({ remainingSeconds: 25, isPaused: false }),
    };
    mockPrisma = {
      roomMember: {
        findUnique: vi.fn().mockResolvedValue({
          user: { id: 'user-1', username: 'TestCaptain' },
          team: { shortName: 'CSK', color: '#FFFF00' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mockRoomsService = {};
    mockServer = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    };

    gateway = new AuctionGateway(
      mockJwtService,
      mockAuctionEngine,
      mockPrisma,
      mockRoomsService,
    );
    gateway.server = mockServer;
  });

  it('correctly registers and tracks user joining microphone voice chat', async () => {
    const client: any = {
      id: 'socket-user-1',
      emit: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    };

    (gateway as any).activeSockets.set('socket-user-1', {
      userId: 'user-1',
      roomId: 'room-101',
    });

    await gateway.handleVoiceJoin(client, { roomId: 'room-101' });

    // Client should receive existing peers list
    expect(client.emit).toHaveBeenCalledWith('voice_joined', { peers: [] });

    // Other members in room should receive voice_user_joined notification
    expect(client.to).toHaveBeenCalledWith('room:room-101');

    // Internal voice participants map must track participant
    const roomVoice = (gateway as any).voiceParticipants.get('room-101');
    expect(roomVoice).toBeDefined();
    expect(roomVoice.has('socket-user-1')).toBe(true);

    const participant = roomVoice.get('socket-user-1');
    expect(participant.username).toBe('TestCaptain');
    expect(participant.teamShortName).toBe('CSK');
    expect(participant.teamColor).toBe('#FFFF00');
    expect(participant.isMuted).toBe(false);
  });

  it('updates participant mute and speaking state in real time', async () => {
    const client: any = {
      id: 'socket-user-1',
      emit: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    };

    (gateway as any).activeSockets.set('socket-user-1', {
      userId: 'user-1',
      roomId: 'room-101',
    });

    await gateway.handleVoiceJoin(client, { roomId: 'room-101' });

    // Now update state to muted: true, speaking: false
    await gateway.handleVoiceState(client, {
      roomId: 'room-101',
      isMuted: true,
      isSpeaking: false,
    });

    const participant = (gateway as any).voiceParticipants.get('room-101').get('socket-user-1');
    expect(participant.isMuted).toBe(true);
    expect(participant.isSpeaking).toBe(false);

    expect(mockServer.to).toHaveBeenCalledWith('room:room-101');
    expect(mockServer.emit).toHaveBeenCalledWith('voice_state_changed', {
      socketId: 'socket-user-1',
      userId: 'user-1',
      isMuted: true,
      isSpeaking: false,
    });
  });

  it('relays WebRTC signals directly to the recipient socket', async () => {
    const client: any = {
      id: 'socket-sender',
      emit: vi.fn(),
    };

    (gateway as any).activeSockets.set('socket-sender', {
      userId: 'user-1',
      roomId: 'room-101',
    });

    const sampleSignal = { type: 'offer', sdp: 'v=0...' };

    await gateway.handleVoiceSignal(client, {
      toSocketId: 'socket-receiver',
      signal: sampleSignal,
    });

    expect(mockServer.to).toHaveBeenCalledWith('socket-receiver');
    expect(mockServer.emit).toHaveBeenCalledWith('voice_signal', {
      fromSocketId: 'socket-sender',
      signal: sampleSignal,
      userId: 'user-1',
    });
  });

  it('cleans up voice participant when user leaves microphone chat explicitly', async () => {
    const client: any = {
      id: 'socket-user-1',
      emit: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    };

    (gateway as any).activeSockets.set('socket-user-1', {
      userId: 'user-1',
      roomId: 'room-101',
    });

    await gateway.handleVoiceJoin(client, { roomId: 'room-101' });
    expect((gateway as any).voiceParticipants.get('room-101').has('socket-user-1')).toBe(true);

    await gateway.handleVoiceLeave(client, { roomId: 'room-101' });

    expect((gateway as any).voiceParticipants.get('room-101').has('socket-user-1')).toBe(false);
    expect(mockServer.to).toHaveBeenCalledWith('room:room-101');
    expect(mockServer.emit).toHaveBeenCalledWith('voice_user_left', {
      socketId: 'socket-user-1',
      userId: 'user-1',
    });
  });

  it('cleans up voice participant automatically on socket disconnection', async () => {
    const client: any = {
      id: 'socket-user-1',
      emit: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    };

    (gateway as any).activeSockets.set('socket-user-1', {
      userId: 'user-1',
      roomId: 'room-101',
    });

    await gateway.handleVoiceJoin(client, { roomId: 'room-101' });

    await gateway.handleDisconnect(client);

    expect((gateway as any).voiceParticipants.get('room-101').has('socket-user-1')).toBe(false);
    expect(mockServer.to).toHaveBeenCalledWith('room:room-101');
    expect(mockServer.emit).toHaveBeenCalledWith('voice_user_left', {
      socketId: 'socket-user-1',
      userId: 'user-1',
    });
  });
});
