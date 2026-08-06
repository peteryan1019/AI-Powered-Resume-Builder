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
  private readonly apiUrl = '/api';

  /** Registers a build job from a posting URL and returns its jobId. */
  startBuild(
    userId: string,
    url: string,
    templateId: string,
  ): Observable<{ jobId: string }> {
    return this.registerBuild(userId, { URL: url, templateId });
  }

  /**
   * Registers a build job from a pasted job description. Used after a URL build
   * stopped with `job_post_unreadable` — the AI could not see the posting, so
   * the user supplies its text instead.
   */
  startBuildFromDescription(
    userId: string,
    jobDescription: string,
    templateId: string,
  ): Observable<{ jobId: string }> {
    return this.registerBuild(userId, { jobDescription, templateId });
  }

  private registerBuild(
    userId: string,
    body: { templateId: string; URL?: string; jobDescription?: string },
  ): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(
      `${this.apiUrl}/users/${userId}/resumes`,
      body,
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
