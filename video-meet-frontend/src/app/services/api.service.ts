import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  appendTranscript(meetingId: string, text: string, speaker?: string) {
    return this.http.post(`${environment.apiBaseUrl}/api/transcripts`, { meetingId, text, speaker });
  }

  transcriptDownloadUrl(meetingId: string) {
    return `${environment.apiBaseUrl}/api/transcripts/${meetingId}`;
  }

  setMeetingLimit(meetingId: string, limit: number) {
    return this.http.post(`${environment.apiBaseUrl}/api/meetings/${meetingId}/limit`, { limit });
  }

  joinRoom(meetingId: string, clientId: string) {
    return this.http.post(`${environment.apiBaseUrl}/api/rooms/${meetingId}/join`, { clientId });
  }

  leaveRoom(meetingId: string, clientId: string) {
    return this.http.post(`${environment.apiBaseUrl}/api/rooms/${meetingId}/leave`, { clientId });
  }
}
