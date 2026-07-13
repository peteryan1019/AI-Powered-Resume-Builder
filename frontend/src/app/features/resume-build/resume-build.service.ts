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

  /** Kicks off a placeholder generation job for the given user. */
  startBuild(userId: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(
      `/api/users/${userId}/resumes`,
      {},
      { withCredentials: true },
    );
  }

  eventsUrl(userId: string, jobId: string): string {
    return `/api/users/${userId}/resumes/${jobId}/events`;
  }

  pdfUrl(userId: string, jobId: string): string {
    return `/api/users/${userId}/resumes/${jobId}/pdf`;
  }
}
