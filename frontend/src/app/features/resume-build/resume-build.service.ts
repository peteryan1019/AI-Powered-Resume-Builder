import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ResumeBuildStep {
  state: 'generating' | 'checking' | 'generating_pdf' | 'done';
  label: string;
  step: number;
  total: number;
}

export interface ResumeBuildComplete {
  pdfUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ResumeBuildService {
  private readonly http = inject(HttpClient);

  // Absolute base (matching ResumeService). The build stream is opened with an
  // EventSource, which is same-origin unless it hits the backend directly; using
  // the absolute origin + withCredentials ensures the backend session cookie is
  // sent (the global CORS config allows localhost:4200 with credentials).
  private readonly apiUrl = 'http://localhost:3000/api';

  /** Registers a build job and returns the jobId to stream progress against. */
  startBuild(
    userId: string,
    url: string,
    templateId: string,
  ): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(
      `${this.apiUrl}/users/${userId}/resumes`,
      { URL: url, templateId },
      { withCredentials: true },
    );
  }

  retryBuild(userId: string, jobId: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(
      `${this.apiUrl}/users/${userId}/resumes/${jobId}/retry`,
      {},
      { withCredentials: true },
    );
  }

  eventsUrl(userId: string, jobId: string): string {
    return `${this.apiUrl}/users/${userId}/resumes/${jobId}/events`;
  }

  pdfUrl(userId: string, resumeId: string): string {
    return `${this.apiUrl}/users/${userId}/resumes/${resumeId}/pdf`;
  }
}
