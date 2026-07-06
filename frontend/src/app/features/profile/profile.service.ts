// frontend/src/app/features/profile/profile.service.ts

import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Profile, ProfileSection, ProfileInstance, SectionType } from './profile.types';

const API = '/api/profile';

@Injectable({ providedIn: 'root' })
export class ProfileService {

  // Single source of truth for the current profile state.
  // A signal (not a plain BehaviorSubject) so updates from async HTTP
  // callbacks are picked up by zoneless change detection automatically.
  private profileSignal = signal<Profile | null>(null);
  readonly profile = this.profileSignal.asReadonly();

  constructor(private http: HttpClient) {}

  // ── Load ────────────────────────────────
  loadProfile(): Observable<{ profile: Profile | null }> {
    return this.http.get<{ profile: Profile | null }>(API).pipe(
      tap(({ profile }) => this.profileSignal.set(profile))
    );
  }

  // ── Basic info + links ──────────────────
  saveBasicInfo(data: Partial<Profile>): Observable<{ profile: Profile }> {
    return this.http.put<{ profile: Profile }>(API, data).pipe(
      tap(({ profile }) => this.profileSignal.set(profile))
    );
  }

  // ── Resume upload ───────────────────────
  uploadResume(file: File): Observable<{ profile: Profile; message: string }> {
    const form = new FormData();
    form.append('resume', file);
    return this.http.post<{ profile: Profile; message: string }>(`${API}/resume`, form);
    // NOTE: after upload, AI parsing result arrives via WebSocket (Prithvi)
    // and will call loadProfile() to refresh state when done.
  }

  // ── Sections ────────────────────────────
  addSection(type: SectionType, label: string): Observable<{ section: ProfileSection }> {
    return this.http.post<{ section: ProfileSection }>(`${API}/sections`, { type, label }).pipe(
      tap(({ section }) => {
        const profile = this.profileSignal();
        if (profile) {
          this.profileSignal.set({
            ...profile,
            sections: [...profile.sections, { ...section, instances: [] }],
          });
        }
      })
    );
  }

  deleteSection(sectionId: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${API}/sections/${sectionId}`).pipe(
      tap(() => {
        const profile = this.profileSignal();
        if (profile) {
          this.profileSignal.set({
            ...profile,
            sections: profile.sections.filter(s => s.id !== sectionId),
          });
        }
      })
    );
  }

  reorderSections(sections: { id: string; order: number }[]): Observable<{ reordered: boolean }> {
    return this.http.put<{ reordered: boolean }>(`${API}/sections/reorder`, { sections });
  }

  // ── Instances ───────────────────────────
  addInstance(sectionId: string, data: Record<string, unknown>): Observable<{ instance: ProfileInstance }> {
    return this.http
      .post<{ instance: ProfileInstance }>(`${API}/sections/${sectionId}/instances`, { data })
      .pipe(
        tap(({ instance }) => {
          const profile = this.profileSignal();
          if (profile) {
            this.profileSignal.set({
              ...profile,
              sections: profile.sections.map(s =>
                s.id === sectionId
                  ? { ...s, instances: [...s.instances, instance] }
                  : s
              ),
            });
          }
        })
      );
  }

  updateInstance(
    sectionId: string,
    instanceId: string,
    data: Record<string, unknown>
  ): Observable<{ instance: ProfileInstance }> {
    return this.http
      .put<{ instance: ProfileInstance }>(`${API}/sections/${sectionId}/instances/${instanceId}`, { data })
      .pipe(
        tap(({ instance }) => {
          const profile = this.profileSignal();
          if (profile) {
            this.profileSignal.set({
              ...profile,
              sections: profile.sections.map(s =>
                s.id === sectionId
                  ? {
                      ...s,
                      instances: s.instances.map(i => (i.id === instanceId ? instance : i)),
                    }
                  : s
              ),
            });
          }
        })
      );
  }

  deleteInstance(sectionId: string, instanceId: string): Observable<{ deleted: boolean }> {
    return this.http
      .delete<{ deleted: boolean }>(`${API}/sections/${sectionId}/instances/${instanceId}`)
      .pipe(
        tap(() => {
          const profile = this.profileSignal();
          if (profile) {
            this.profileSignal.set({
              ...profile,
              sections: profile.sections.map(s =>
                s.id === sectionId
                  ? { ...s, instances: s.instances.filter(i => i.id !== instanceId) }
                  : s
              ),
            });
          }
        })
      );
  }
}