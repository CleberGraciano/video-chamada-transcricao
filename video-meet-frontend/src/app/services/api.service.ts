import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API_BASE = 'http://localhost:8080';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  appendTranscript(meetingId: string, text: string, speaker?: string) {
    return this.http.post(`${API_BASE}/api/transcripts`, { meetingId, text, speaker });
  }

  transcriptDownloadUrl(meetingId: string) {
    return `${API_BASE}/api/transcripts/${meetingId}`;
  }
}
