import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

export interface CreateResumeRequest {
  jobPostingUrl: string;
  templateId: string;
}

export interface CreatedResume {
  id: string;
  userId: string;
  templateId: string;
  jobPostingUrl: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResumeResponse {
  resume: CreatedResume;
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

  getPdfUrl(userId: string, resumeId: string): string {
    return (
      `${this.apiUrl}/users/${userId}` +
      `/resumes/${resumeId}/pdf`
    );
  }
}