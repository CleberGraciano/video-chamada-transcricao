import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

const API_BASE = environment.apiBaseUrl;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  <div class="card">
    <h3>Configurar limite de participantes</h3>
    <p>Defina o limite máximo de participantes permitidos na sala.</p>
    <div class="controls">
      <input type="number" min="1" [(ngModel)]="participantLimit" placeholder="Limite">
      <button (click)="applyLimit()" [disabled]="!meetingId">Aplicar limite</button>
    </div>
    <p *ngIf="limitApplied" class="badge">Limite aplicado: {{ participantLimit }}</p>
  </div>
  `
})
export class HomeComponent {
  loading = false;
  joinUrl = '';
  meetingId = '';
  participantLimit = 2;
  limitApplied = false;
  constructor(private http: HttpClient) {}

  createMeeting() {
    this.loading = true;
    this.http.post<{id:string; joinUrl:string}>(`${environment.apiBaseUrl}/api/meetings`, {})
      .subscribe({
        next: (res) => {
          this.joinUrl = res.joinUrl;
          this.meetingId = res.id;
          // auto-apply limit of 2
          this.http.post(`${environment.apiBaseUrl}/api/meetings/${this.meetingId}/limit`, { limit: this.participantLimit })
            .subscribe({ next: () => this.limitApplied = true, error: e => console.warn('Falha ao aplicar limite automaticamente', e) });
        },
        error: (e) => alert('Erro ao criar reunião: ' + (e?.message || e)),
        complete: () => this.loading = false
      });
  }

  async copy() {
    if (!this.joinUrl) return;
    await navigator.clipboard.writeText(this.joinUrl);
    alert('Link copiado!');
  }
  applyLimit() {
    if (!this.meetingId) return;
    this.http.post(`${environment.apiBaseUrl}/api/meetings/${this.meetingId}/limit`, { limit: this.participantLimit })
      .subscribe({ next: () => this.limitApplied = true, error: e => alert('Erro ao aplicar limite: ' + (e?.message || e)) });
  }
}
