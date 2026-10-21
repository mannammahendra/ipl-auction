import { socketService } from './socket';
import { useAuctionStore, VoiceParticipant } from './store';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

class VoiceChatManager {
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private roomId: string | null = null;
  private isSpeaking = false;
  private silenceTimer: any = null;
  private candidateQueue = new Map<string, any[]>();

  async startVoice(roomId: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    this.roomId = roomId;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported on this device/browser');
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Default to unmuted when explicitly turning on mic
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      // Ensure local tracks are immediately attached to all active peer connections
      this.peerConnections.forEach((pc, remoteSocketId) => {
        this.localStream!.getTracks().forEach((track) => {
          const senders = pc.getSenders();
          const alreadyAdded = senders.some((s) => s.track?.id === track.id);
          if (!alreadyAdded) {
            pc.addTrack(track, this.localStream!);
          }
        });
        // Proactively renegotiate now that local audio track is live
        if (pc.signalingState === 'stable') {
          pc.createOffer({ offerToReceiveAudio: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => socketService.sendVoiceSignal(remoteSocketId, pc.localDescription))
            .catch((e) => console.warn('Renegotiation offer error:', e));
        }
      });

      useAuctionStore.getState().setVoiceConnected(true);
      useAuctionStore.getState().setMicMuted(false);

      this.setupAudioAnalysis(this.localStream);

      // Tell backend socket we joined voice
      socketService.joinVoice(roomId);
      socketService.setVoiceState(roomId, { isMuted: false, isSpeaking: false });

      return true;
    } catch (err: any) {
      console.warn('Microphone permission or connection error:', err.message);
      this.stopVoice();
      useAuctionStore.getState().setLastError(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access in your browser settings.'
          : err.message || 'Failed to start microphone voice chat',
      );
      return false;
    }
  }

  toggleMute(): boolean {
    const store = useAuctionStore.getState();
    if (!this.localStream) return false;

    const newMuted = !store.isMicMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !newMuted;
    });

    store.setMicMuted(newMuted);
    if (this.roomId) {
      socketService.setVoiceState(this.roomId, { isMuted: newMuted, isSpeaking: false });
    }
    return newMuted;
  }

  stopVoice() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    this.audioElements.forEach((el) => {
      el.pause();
      el.srcObject = null;
      el.remove();
    });
    this.audioElements.clear();
    this.candidateQueue.clear();

    if (this.roomId) {
      socketService.leaveVoice(this.roomId);
    }
    this.roomId = null;

    const store = useAuctionStore.getState();
    store.setVoiceConnected(false);
    store.setMicMuted(true);
    store.setIsSpeaking(false);
  }

  // Handle incoming peers when our client joins
  handleVoiceJoined(peers: VoiceParticipant[]) {
    peers.forEach((peer) => {
      if (peer.socketId) {
        this.createPeerConnection(peer.socketId, true);
      }
    });
  }

  // Handle when another peer joins
  handleUserJoined(peer: VoiceParticipant) {
    if (peer.socketId) {
      this.createPeerConnection(peer.socketId, false);
    }
  }

  // Handle peer disconnect
  handleUserLeft(socketId: string) {
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(socketId);
    }
    const audio = this.audioElements.get(socketId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(socketId);
    }
    this.candidateQueue.delete(socketId);
  }

  // Handle WebRTC signaling exchange
  async handleVoiceSignal(fromSocketId: string, signal: any) {
    try {
      const pc = this.createPeerConnection(fromSocketId, false);

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketService.sendVoiceSignal(fromSocketId, answer);

        // Process buffered ICE candidates if any
        if (this.candidateQueue.has(fromSocketId)) {
          const queued = this.candidateQueue.get(fromSocketId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          this.candidateQueue.delete(fromSocketId);
        }
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        if (this.candidateQueue.has(fromSocketId)) {
          const queued = this.candidateQueue.get(fromSocketId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          this.candidateQueue.delete(fromSocketId);
        }
      } else if (signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
        } else {
          // Buffer candidate until remote description is set
          if (!this.candidateQueue.has(fromSocketId)) {
            this.candidateQueue.set(fromSocketId, []);
          }
          this.candidateQueue.get(fromSocketId)!.push(signal.candidate);
        }
      }
    } catch (e) {
      console.warn('WebRTC signal error with peer:', fromSocketId, e);
    }
  }

  private createPeerConnection(remoteSocketId: string, isInitiator: boolean): RTCPeerConnection {
    if (this.peerConnections.has(remoteSocketId)) {
      return this.peerConnections.get(remoteSocketId)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(remoteSocketId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendVoiceSignal(remoteSocketId, { candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      let audio = this.audioElements.get(remoteSocketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        (audio as any).playsInline = true;
        audio.volume = 1.0;
        audio.style.display = 'none';
        if (typeof document !== 'undefined' && document.body) {
          document.body.appendChild(audio);
        }
        this.audioElements.set(remoteSocketId, audio);
      }
      audio.srcObject = event.streams[0];
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Voice chat audio autoplay restricted, awaiting user touch:', err);
          const resumeAudio = () => {
            audio?.play().catch(() => {});
            window.removeEventListener('click', resumeAudio);
            window.removeEventListener('touchstart', resumeAudio);
          };
          window.addEventListener('click', resumeAudio, { once: true });
          window.addEventListener('touchstart', resumeAudio, { once: true });
        });
      }
    };

    const handleNegotiation = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        socketService.sendVoiceSignal(remoteSocketId, offer);
      } catch (err) {
        console.warn('Error creating offer for peer:', remoteSocketId, err);
      }
    };

    pc.onnegotiationneeded = handleNegotiation;

    // Add local tracks if available AFTER handlers are registered
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    if (isInitiator) {
      setTimeout(handleNegotiation, 60);
    }

    return pc;
  }

  private setupAudioAnalysis(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const speakingNow = avg > 18 && !useAuctionStore.getState().isMicMuted;

        if (speakingNow && !this.isSpeaking) {
          this.isSpeaking = true;
          useAuctionStore.getState().setIsSpeaking(true);
          if (this.roomId) {
            socketService.setVoiceState(this.roomId, { isSpeaking: true });
          }
          if (this.silenceTimer) clearTimeout(this.silenceTimer);
        } else if (!speakingNow && this.isSpeaking) {
          if (!this.silenceTimer) {
            this.silenceTimer = setTimeout(() => {
              this.isSpeaking = false;
              useAuctionStore.getState().setIsSpeaking(false);
              if (this.roomId) {
                socketService.setVoiceState(this.roomId, { isSpeaking: false });
              }
              this.silenceTimer = null;
            }, 300);
          }
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Could not initialize voice visualizer audio analysis:', e);
    }
  }
}

export const voiceChatManager = new VoiceChatManager();
