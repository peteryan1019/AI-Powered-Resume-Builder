import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

export interface CreateResumeRequest {
  URL: string;
  templateId: string;
}

export interface CreatedResume {
  id: string;
  userId: string;
  templateId: string;
  URL: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResumeResponse {
  resume: CreatedResume;
}

/** Metadata for one previously-generated resume (no pdf bytes). */
export interface ResumeSummary {
  id: string;
  title: string | null;
  templateId: string;
  URL: string;
  createdAt: string;
}

export interface ListResumesResponse {
  resumes: ResumeSummary[];
}

@Injectable({
  providedIn: "root",
})
export class ResumeService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = "http://localhost:3000/api";

  createResume(
    userId: string,
    request: CreateResumeRequest,
  ): Observable<CreateResumeResponse> {
    return this.http.post<CreateResumeResponse>(
      `${this.apiUrl}/users/${userId}/resumes`,
      request,
      {
        withCredentials: true,
      },
    );
  }

  /** Lists the user's previously-generated resumes, newest first. */
  listResumes(userId: string): Observable<ListResumesResponse> {
    return this.http.get<ListResumesResponse>(
      `${this.apiUrl}/users/${userId}/resumes`,
      {
        withCredentials: true,
      },
    );
  }

  getPdfUrl(userId: string, resumeId: string): string {
    return (
      `${this.apiUrl}/users/${userId}` +
      `/resumes/${resumeId}/pdf`
    );
  }
}