import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Client, IMessage } from '@stomp/stompjs';
import { ApiService } from '../services/api.service';

const WS_URL = 'http://localhost:8080/ws';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="card">
    <h2>Sala: {{ roomId }}</h2>
    <div class="row">
      <div class="col video-box">
        <div class="badge">Você</div>
        <video #localVideo autoplay playsinline muted></video>
      </div>
      <div class="col video-box">
        <div class="badge">Remoto</div>
        <video #remoteVideo autoplay playsinline></video>
      </div>
    </div>
    <div class="controls">
      <button class="primary" (click)="startCall()" [disabled]="inCall">Iniciar</button>
      <button (click)="toggleMute()">{{ muted ? 'Desmutar' : 'Mutar' }}</button>
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

  private pc?: RTCPeerConnection;
  private localStream?: MediaStream;
  private remoteStream?: MediaStream;
  private stomp?: Client;
  private polite = false; // simple tie-breaker
  speechSupported = 'webkitSpeechRecognition' in (window as any) || 'SpeechRecognition' in (window as any);
  private recognizer?: any;

  @ViewChild('localVideo', { static: true }) localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo', { static: true }) remoteVideo!: ElementRef<HTMLVideoElement>;

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
      webSocketFactory: () => new SockJS(WS_URL) as any,
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
      this.localVideo.nativeElement.srcObject = this.localStream;
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
    // We will only create offer when we see a 'join' with ordering tie-breaker
    this.inCall = true;
  }

  private createPeer() {
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.remoteStream = new MediaStream();
    this.remoteVideo.nativeElement.srcObject = this.remoteStream;

    this.localStream?.getTracks().forEach(track => this.pc!.addTrack(track, this.localStream!));

    this.pc.onnegotiationneeded = async () => {
      try {
        await this.makeOffer();
      } catch (e) {
        console.warn('Negotiation failed', e);
      }
    };

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
        // When someone joins, the lexicographically smaller id sends an offer
        if (this.clientId < (data.sender || '')) {
          // Ensure we have a peer and local media; if not in a call, still offer receive-only
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
        break;
      }
      case 'candidate': {
        try { await this.pc?.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        break;
      }
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
