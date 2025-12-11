import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Client, IMessage } from '@stomp/stompjs';
import { ApiService } from '../services/api.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="card">
    <h2>Sala: {{ roomId }}</h2>
    <p *ngIf="roomFull" class="badge">Sala cheia (2/2)</p>
    <div *ngIf="fullMessage" class="toast">{{ fullMessage }}</div>
    <div class="stage" [class.expanded]="expanded">
      <!-- Primary video (who is large) -->
      <div class="primary" (click)="togglePrimary()">
        <div class="badge">{{ primaryIsRemote ? 'Remoto' : 'Você' }}</div>
        <video #primaryVideo autoplay playsinline [muted]="!primaryIsRemote"></video>
      </div>
      <!-- Picture-in-picture thumbnail (bottom-right) -->
      <div class="pip" [class.hidden]="pipHidden" (click)="togglePrimary()">
        <div class="badge">{{ primaryIsRemote ? 'Você' : 'Remoto' }}</div>
        <video #pipVideo autoplay playsinline [muted]="primaryIsRemote"></video>
      </div>
    </div>
    <!-- Thumbnails (hidden when limit=2 and remote is focused) -->
    <div class="thumbs" *ngIf="displayedThumbs.length && !hideThumbsForTwo()">
      <div class="thumb" *ngFor="let t of displayedThumbs" (click)="focusRemote(t.id)">
        <span class="badge">{{ t.label }}</span>
        <video [id]="'thumb_'+t.id" autoplay playsinline></video>
      </div>
    </div>
    <div class="controls">
      <button class="primary" (click)="startCall()" [disabled]="inCall">Iniciar</button>
      <button (click)="toggleMute()">{{ muted ? 'Desmutar' : 'Mutar' }}</button>
      <button (click)="pipHidden = !pipHidden">{{ pipHidden ? 'Mostrar miniatura' : 'Ocultar miniatura' }}</button>
      <button (click)="expanded = !expanded">{{ expanded ? 'Reduzir' : 'Expandir' }}</button>
      <a [href]="downloadUrl" target="_blank"><button>Baixar transcrição</button></a>
      <button class="danger" (click)="hangup()" [disabled]="!inCall">Encerrar</button>
    </div>
  </div>

  <div class="card">
    <h3>Transcrição (local)</h3>
    <p *ngIf="!speechSupported">Reconhecimento de fala não suportado neste navegador.</p>
    <div class="controls" *ngIf="speechSupported">
      <button (click)="toggleTranscription()">{{ transcribing ? 'Parar' : 'Transcrever' }}</button>
    </div>
    <textarea [value]="transcript" readonly></textarea>
  </div>
  `
})
export class RoomComponent implements OnInit, OnDestroy {
  roomId = '';
  clientId = Math.random().toString(36).slice(2);
  inCall = false;
  muted = false;
  transcript = '';
  transcribing = false;
  downloadUrl = '';
  roomFull = false;
  fullMessage = '';
  private ready = false;
  private peerReadyFromRemote = false;

  private pc?: RTCPeerConnection;
  private localStream?: MediaStream;
  private stomp?: Client;
  private pcs: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  remoteThumbs: { id: string; label: string }[] = [];
  get displayedThumbs() { return this.remoteThumbs.slice(0, 1); }
  hideThumbsForTwo(): boolean {
    // When room limit is 2, hide thumbnails if remote is focused
    return this.primaryIsRemote && this.displayedThumbs.length > 0;
  }
  private polite = false; // simple tie-breaker
  speechSupported = 'webkitSpeechRecognition' in (window as any) || 'SpeechRecognition' in (window as any);
  private recognizer?: any;
  primaryIsRemote = true; // large is remote by default
  pipHidden = false;
  expanded = false;

  @ViewChild('localVideo', { static: false }) localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo', { static: false }) remoteVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('primaryVideo', { static: true }) primaryVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('pipVideo', { static: true }) pipVideo!: ElementRef<HTMLVideoElement>;

  private route = inject(ActivatedRoute);
  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.roomId = this.route.snapshot.paramMap.get('id') || '';
    this.downloadUrl = this.api.transcriptDownloadUrl(this.roomId);
    this.connectSignaling();
    // Ensure slot is freed if the tab/window closes
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  ngOnDestroy(): void {
    this.stopTranscription();
    this.stomp?.deactivate();
    this.pc?.close();
    this.localStream?.getTracks().forEach(t => t.stop());
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    // Attempt to leave on destroy as a fallback
    this.api.leaveRoom(this.roomId, this.clientId).subscribe({ next: () => {}, error: () => {} });
  }

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    try {
      navigator.sendBeacon?.(
        `${environment.apiBaseUrl}/api/rooms/${this.roomId}/leave`,
        new Blob([JSON.stringify({ clientId: this.clientId })], { type: 'application/json' })
      );
    } catch {
      // best effort; ignore errors
    }
  };

  private async connectSignaling() {
    const SockJS = (await import('sockjs-client')).default;
    this.stomp = new Client({
      webSocketFactory: () => new SockJS(environment.wsUrl) as any,
      reconnectDelay: 2000
    });
    this.stomp.onConnect = () => {
      this.stomp?.subscribe(`/topic/room/${this.roomId}`, (msg: IMessage) => this.onSignal(msg));
      this.send({ type: 'join', sender: this.clientId });
    };
    this.stomp.activate();
  }

  private async setupMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // assign to appropriate element depending on current primary
      const localEl = this.primaryIsRemote ? this.pipVideo.nativeElement : this.primaryVideo.nativeElement;
      localEl.srcObject = this.localStream;
    } catch (err: any) {
      console.error('Erro ao acessar câmera/microfone', err);
      alert('Não foi possível acessar a câmera/microfone. Verifique as permissões do navegador.');
      throw err;
    }
  }

  async startCall() {
    if (this.inCall) return;
    await this.setupMedia();
    const joinRes: any = await this.api.joinRoom(this.roomId, this.clientId).toPromise().catch(e => {
      alert(e?.error?.reason || 'Erro ao entrar na sala');
      throw e;
    });
    if (!joinRes?.allowed) {
      this.roomFull = true;
      this.showFullToast('Sala cheia: limite de 2 participantes atingido.');
      return;
    }
    this.ready = true;
    this.send({ type: 'ready' });
    this.inCall = true;
  }

  private createPeerFor(remoteId: string) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    // Add local tracks
    this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream!));
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ type: 'candidate', candidate: e.candidate, target: remoteId }); };
    pc.ontrack = (e) => {
      const incoming = e.streams[0];
      // Store and attach incoming stream
      this.remoteStreams.set(remoteId, incoming);
      const remoteEl = this.primaryIsRemote ? this.primaryVideo.nativeElement : this.pipVideo.nativeElement;
      remoteEl.srcObject = incoming;
      // also attach to thumbnail element
      queueMicrotask(() => {
        const el = document.getElementById('thumb_' + remoteId) as HTMLVideoElement | null;
        if (el) el.srcObject = incoming;
      });
      this.addOrUpdateThumb(remoteId);
    };
    this.pcs.set(remoteId, pc);
    return pc;
  }

  private async makeOffer(remoteId: string) {
    let pc = this.pcs.get(remoteId);
    if (!pc) pc = this.createPeerFor(remoteId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ type: 'offer', sdp: offer, target: remoteId });
  }

  private async onSignal(msg: IMessage) {
    const data = JSON.parse(msg.body);
    if (data.sender === this.clientId) return; // ignore own

    switch (data.type) {
      case 'join': {
        // New participant joined; if we're ready, proactively offer to them
        if (this.ready && data.sender) {
          await this.makeOffer(data.sender);
        }
        break;
      }
      case 'ready': {
        this.peerReadyFromRemote = true;
        // Proactively offer upon ready to reduce connection time
        if (this.ready && data.sender) {
          await this.makeOffer(data.sender);
        }
        break;
      }
      case 'offer': {
        const from = data.sender;
        let pc = this.pcs.get(from);
        if (!pc) pc = this.createPeerFor(from);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ type: 'answer', sdp: answer, target: from });
        break;
      }
      case 'answer': {
        const from = data.sender;
        const pc = this.pcs.get(from);
        await pc?.setRemoteDescription(new RTCSessionDescription(data.sdp));
        this.addOrUpdateThumb(from);
        break;
      }
      case 'candidate': {
        const from = data.sender;
        const pc = this.pcs.get(data.target || from);
        try { await pc?.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        break;
      }
      case 'leave': {
        const from = data.sender;
        this.removePeer(from);
        break;
      }
    }
  }

  private addOrUpdateThumb(id: string) {
    if (!this.remoteThumbs.find(t => t.id === id)) {
      this.remoteThumbs.push({ id, label: 'Remoto' });
    }
    // ensure thumbnail video attaches
    const stream = this.remoteStreams.get(id);
    if (stream) {
      const el = document.getElementById('thumb_' + id) as HTMLVideoElement | null;
      if (el) el.srcObject = stream;
    }
  }

  focusRemote(id: string) {
    // make selected remote the primary view
    this.primaryIsRemote = true;
    const stream = this.remoteStreams.get(id);
    if (stream) {
      this.primaryVideo.nativeElement.srcObject = stream;
      // local stays in PiP
      if (this.localStream) this.pipVideo.nativeElement.srcObject = this.localStream;
    }
  }

  private removePeer(id: string) {
    const pc = this.pcs.get(id);
    pc?.close();
    this.pcs.delete(id);
    const s = this.remoteStreams.get(id);
    if (s) {
      s.getTracks().forEach(t => t.stop());
      this.remoteStreams.delete(id);
    }
    this.remoteThumbs = this.remoteThumbs.filter(t => t.id !== id);
  }

  togglePrimary() {
    // swap which stream is large vs small
    this.primaryIsRemote = !this.primaryIsRemote;
    // reassign srcObjects
    if (this.localStream) {
      const localEl = this.primaryIsRemote ? this.pipVideo.nativeElement : this.primaryVideo.nativeElement;
      localEl.srcObject = this.localStream;
    }
    const r = this.getFirstRemoteStream();
    if (r) {
      const remoteEl = this.primaryIsRemote ? this.primaryVideo.nativeElement : this.pipVideo.nativeElement;
      remoteEl.srcObject = r;
    }
  }

  private getFirstRemoteStream(): MediaStream | undefined {
    const iter = this.remoteStreams.keys();
    const first = iter.next();
    if (!first.done) {
      return this.remoteStreams.get(first.value);
    }
    return undefined;
  }

  private send(payload: any) {
    this.stomp?.publish({ destination: `/app/room/${this.roomId}`, body: JSON.stringify({ ...payload, sender: this.clientId }) });
  }

  private showFullToast(message: string) {
    this.fullMessage = message;
    setTimeout(() => { this.fullMessage = ''; }, 4000);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.localStream?.getAudioTracks().forEach(t => t.enabled = !this.muted);
  }

  async hangup() {
    this.inCall = false;
    // notify others and free slot
    this.send({ type: 'leave' });
    this.pcs.forEach(pc => pc.close());
    this.pcs.clear();
    this.remoteVideo.nativeElement.srcObject = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = undefined;
    // call REST leave
    try { await this.api.leaveRoom(this.roomId, this.clientId).toPromise(); } catch {}
  }

  toggleTranscription() {
    if (!this.speechSupported) return;
    if (this.transcribing) {
      this.stopTranscription();
    } else {
      this.startTranscription();
    }
  }

  private startTranscription() {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    this.recognizer = new SR();
    this.recognizer.lang = 'pt-BR';
    this.recognizer.continuous = true;
    this.recognizer.interimResults = true;

    this.recognizer.onresult = (ev: any) => {
      let finalText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalText += res[0].transcript + ' ';
      }
      if (finalText) {
        this.transcript += finalText + '\n';
        this.api.appendTranscript(this.roomId, finalText.trim(), 'user').subscribe();
      }
    };
    this.recognizer.start();
    this.transcribing = true;
  }

  private stopTranscription() {
    try { this.recognizer?.stop(); } catch {}
    this.transcribing = false;
  }
}
