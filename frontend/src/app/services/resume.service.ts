import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CreateResumeRequest {
  URL: string;
  templateId: string;
}

export interface CreatedResume {
  id: string;
  userId: string;
  templateId: string;
  URL: string;
  content: ResumeContent;
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

export interface ResumeText {
  id: string;
  text: string;
}

export interface ContactPart {
  id: string;
  text: string;
  href?: string;
}

export interface ResumeBullet {
  id: string;
  text: string;
  label?: string;
  url?: string;
}

export interface StandardEntry {
  id: string;
  heading: string;
  meta: string;
  date: string;
  bullets: ResumeBullet[];
}

export interface OrganizationEntry {
  id: string;
  org: string;
  role: string;
  location: string;
  date: string;
  bullets: ResumeBullet[];
}

export interface BulletsSection {
  id: string;
  title: string;
  type: 'bullets';
  bullets: ResumeBullet[];
}

export interface EntriesSection {
  id: string;
  title: string;
  type: 'entries';
  entries: StandardEntry[];
}

export interface OrganizationEntriesSection {
  id: string;
  title: string;
  type: 'org_entries';
  entries: OrganizationEntry[];
}

export interface EducationSection {
  id: string;
  title: string;
  type: 'education';
  school: ResumeText;
  bullets: ResumeBullet[];
}

export type ResumeSection =
  BulletsSection | EntriesSection | OrganizationEntriesSection | EducationSection;

export interface ResumeContent {
  jobPostTitle: string;

  header: {
    name: ResumeText;
    contact: {
      id: string;
      parts: ContactPart[];
    };
  };

  sections: ResumeSection[];
}
export interface EditableResumeResponse {
  resume: {
    id: string;
    title: string | null;
    templateId: string;
    content: ResumeContent;
  };
}

export interface RegenerateResumeResponse {
  resume: {
    id: string;
    title: string;
    templateId: string;
    updatedAt: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class ResumeService {
  private readonly http = inject(HttpClient);

  private readonly apiURL = '/api';

  createResume(userId: string, request: CreateResumeRequest): Observable<CreateResumeResponse> {
    return this.http.post<CreateResumeResponse>(`${this.apiURL}/users/${userId}/resumes`, request, {
      withCredentials: true,
    });
  }

  /** Lists the user's previously-generated resumes, newest first. */
  listResumes(userId: string): Observable<ListResumesResponse> {
    return this.http.get<ListResumesResponse>(`${this.apiURL}/users/${userId}/resumes`, {
      withCredentials: true,
    });
  }

  getResumeForEditing(userId: string, resumeId: string): Observable<EditableResumeResponse> {
    return this.http.get<EditableResumeResponse>(
      `${this.apiURL}/users/${userId}/resumes/${resumeId}/edit`,
      {
        withCredentials: true,
      },
    );
  }

  updateResume(
    userId: string,
    resumeId: string,
    content: ResumeContent,
  ): Observable<EditableResumeResponse> {
    return this.http.patch<EditableResumeResponse>(
      `${this.apiURL}/users/${userId}/resumes/${resumeId}`,
      { content },
      {
        withCredentials: true,
      },
    );
  }

  regenerateResume(userId: string, resumeId: string): Observable<RegenerateResumeResponse> {
    return this.http.post<RegenerateResumeResponse>(
      `${this.apiURL}/users/${userId}/resumes/${resumeId}/regenerate`,
      {},
      {
        withCredentials: true,
      },
    );
  }

  deleteResume(userId: string, resumeId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiURL}/users/${userId}/resumes/${resumeId}`, {
      withCredentials: true,
    });
  }

  getPdfUrl(userId: string, resumeId: string): string {
    return `${this.apiURL}/users/${userId}` + `/resumes/${resumeId}/pdf`;
  }
}
