// frontend/src/app/features/profile/profile.service.ts

import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { Profile, ProfileSection, ProfileInstance, ProfileUser, SectionType } from './profile.types';

const API = '/api/profile';

@Injectable({ providedIn: 'root' })
export class ProfileService {

  // Single source of truth for the current profile state.
  // A signal (not a plain BehaviorSubject) so updates from async HTTP
  // callbacks are picked up by zoneless change detection automatically.
  private profileSignal = signal<Profile | null>(null);
  readonly profile = this.profileSignal.asReadonly();

  // name/email/avatar from the User table — read-only in this feature.
  private userSignal = signal<ProfileUser | null>(null);
  readonly user = this.userSignal.asReadonly();

  constructor(private http: HttpClient) {}

  //  Load
  loadProfile(): Observable<{ profile: Profile | null; user: ProfileUser }> {
    return this.http.get<{ profile: Profile | null; user: ProfileUser }>(API, { withCredentials: true }).pipe(
      tap(({ profile, user }) => {
        this.profileSignal.set(profile);
        this.userSignal.set(user);
      })
    );
  }

  // Basic info + links
  saveBasicInfo(data: Partial<Profile>): Observable<{ profile: Profile }> {
    return this.http.put<{ profile: Profile }>(API, data, { withCredentials: true }).pipe(
      tap(({ profile }) => this.profileSignal.set(profile))
    );
  }

  // Sections
  addSection(type: SectionType, label: string): Observable<{ section: ProfileSection }> {
    return this.http.post<{ section: ProfileSection }>(`${API}/sections`, { type, label }, { withCredentials: true }).pipe(
      tap(({ section }) => {
        const profile = this.profileSignal();
        if (profile) {
          this.profileSignal.set({
            ...profile,
            sections: [...(profile.sections ?? []), { ...section, instances: [] }],
          });
        }
      })
    );
  }

  deleteSection(sectionId: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${API}/sections/${sectionId}`, { withCredentials: true }).pipe(
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
    return this.http.put<{ reordered: boolean }>(`${API}/sections/reorder`, { sections }, { withCredentials: true });
  }

  // Optimistically reorder sections in local state, then persist.
  // The caller is responsible for rolling back (e.g. reloadProfile) on error.
  moveSection(previousIndex: number, currentIndex: number): Observable<{ reordered: boolean }> {
    const profile = this.profileSignal();
    if (!profile || previousIndex === currentIndex) {
      return of({ reordered: false });
    }

    const sections = [...profile.sections];
    const [moved] = sections.splice(previousIndex, 1);
    sections.splice(currentIndex, 0, moved);

    // Renumber `order` to match the new positions (0-based).
    const reordered = sections.map((s, i) => ({ ...s, order: i }));
    this.profileSignal.set({ ...profile, sections: reordered });

    return this.reorderSections(reordered.map(s => ({ id: s.id, order: s.order })));
  }

  // Instances
  addInstance(sectionId: string, data: Record<string, unknown>): Observable<{ instance: ProfileInstance }> {
    return this.http
      .post<{ instance: ProfileInstance }>(`${API}/sections/${sectionId}/instances`, { data }, { withCredentials: true })
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
      .put<{ instance: ProfileInstance }>(`${API}/sections/${sectionId}/instances/${instanceId}`, { data }, { withCredentials: true })
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
      .delete<{ deleted: boolean }>(`${API}/sections/${sectionId}/instances/${instanceId}`, { withCredentials: true })
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

  importResume(file: File) {
    const formData = new FormData();
    formData.append('resume', file);

    return this.http.post<{ profile: unknown }>(
      '/api/profile/import',
      formData,
      { withCredentials: true }
    );
  }
}