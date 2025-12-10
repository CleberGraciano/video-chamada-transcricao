import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

const API_BASE = 'http://localhost:8087';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="card">
    <h2>Criar nova reunião</h2>
    <p>Gere um link para compartilhar e entrar na sala.</p>
    <div class="controls">
      <button class="primary" (click)="createMeeting()" [disabled]="loading">{{ loading ? 'Criando…' : 'Criar reunião' }}</button>
      <span *ngIf="joinUrl" class="badge">ID: {{ meetingId }}</span>
    </div>
    <div *ngIf="joinUrl" class="link" style="margin-top:8px">
      <div>Link:</div>
      <div><a [href]="joinUrl" target="_blank">{{ joinUrl }}</a></div>
      <div class="controls">
        <button (click)="copy()">Copiar link</button>
      </div>
    </div>
  </div>
  `
})
export class HomeComponent {
  loading = false;
  joinUrl = '';
  meetingId = '';
  constructor(private http: HttpClient) {}

  createMeeting() {
    this.loading = true;
    this.http.post<{id:string; joinUrl:string}>(`${API_BASE}/api/meetings`, {})
      .subscribe({
        next: (res) => { this.joinUrl = res.joinUrl; this.meetingId = res.id; },
        error: (e) => alert('Erro ao criar reunião: ' + (e?.message || e)),
        complete: () => this.loading = false
      });
  }

  async copy() {
    if (!this.joinUrl) return;
    await navigator.clipboard.writeText(this.joinUrl);
    alert('Link copiado!');
  }
}
