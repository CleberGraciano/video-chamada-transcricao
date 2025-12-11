import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
  private ready = false;
  private peerReadyFromRemote = false;

  private pc?: RTCPeerConnection;
  private localStream?: MediaStream;
  private remoteStream?: MediaStream;
  private stomp?: Client;
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

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit(): void {
    this.roomId = this.route.snapshot.paramMap.get('id') || '';
    this.downloadUrl = this.api.transcriptDownloadUrl(this.roomId);
    this.connectSignaling();
  }

  ngOnDestroy(): void {
    this.stopTranscription();
    this.stomp?.deactivate();
    this.pc?.close();
    this.localStream?.getTracks().forEach(t => t.stop());
  }

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
    this.createPeer();
    this.ready = true;
    this.send({ type: 'ready' });
    this.inCall = true;
  }

  private createPeer() {
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.remoteStream = new MediaStream();
    const remoteEl = this.primaryIsRemote ? this.primaryVideo.nativeElement : this.pipVideo.nativeElement;
    remoteEl.srcObject = this.remoteStream;

    this.localStream?.getTracks().forEach(track => this.pc!.addTrack(track, this.localStream!));

    // negotiation will be triggered explicitly via 'ready' messages

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({ type: 'candidate', candidate: e.candidate });
      }
    };

    this.pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach(t => this.remoteStream!.addTrack(t));
    };
  }

  private async makeOffer() {
    if (!this.pc) this.createPeer();
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    this.send({ type: 'offer', sdp: offer });
  }

  private async onSignal(msg: IMessage) {
    const data = JSON.parse(msg.body);
    if (data.sender === this.clientId) return; // ignore own

    switch (data.type) {
      case 'join': {
        // Wait for 'ready' to avoid glare; no immediate offer on join
        break;
      }
      case 'ready': {
        this.peerReadyFromRemote = true;
        if (this.ready && this.clientId < (data.sender || '')) {
          if (!this.pc) this.createPeer();
          await this.makeOffer();
        }
        break;
      }
      case 'offer': {
        if (!this.pc) this.createPeer();
        await this.pc!.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this.send({ type: 'answer', sdp: answer });
        break;
      }
      case 'answer': {
        await this.pc?.setRemoteDescription(new RTCSessionDescription(data.sdp));
        // ensure remote stream is attached
        const remoteEl = this.primaryIsRemote ? this.primaryVideo.nativeElement : this.pipVideo.nativeElement;
        remoteEl.srcObject = this.remoteStream as MediaStream;
        break;
      }
      case 'candidate': {
        try { await this.pc?.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        break;
      }
    }
  }

  togglePrimary() {
    // swap which stream is large vs small
    this.primaryIsRemote = !this.primaryIsRemote;
    // reassign srcObjects
    if (this.localStream) {
      const localEl = this.primaryIsRemote ? this.pipVideo.nativeElement : this.primaryVideo.nativeElement;
      localEl.srcObject = this.localStream;
    }
    if (this.remoteStream) {
      const remoteEl = this.primaryIsRemote ? this.primaryVideo.nativeElement : this.pipVideo.nativeElement;
      remoteEl.srcObject = this.remoteStream;
    }
  }

  private send(payload: any) {
    this.stomp?.publish({ destination: `/app/room/${this.roomId}`, body: JSON.stringify({ ...payload, sender: this.clientId }) });
  }

  toggleMute() {
    this.muted = !this.muted;
    this.localStream?.getAudioTracks().forEach(t => t.enabled = !this.muted);
  }

  async hangup() {
    this.inCall = false;
    this.pc?.close();
    this.pc = undefined;
    this.remoteVideo.nativeElement.srcObject = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = undefined;
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
