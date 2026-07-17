import type { Profile, ProfileInstance, SectionType, User } from '../../generated/prisma/client.js';

// ─────────────────────────────────────────
// Flattens the normalized Profile/Section/Instance tables into the
// shape the AI-facing "tailor" flow expects:
//
// {
//   headers: { username, contact: { phone, email }, links: { linkedin, github, portfolio } },
//   sections: [{ type, title, date, description }, ...]
// }
//
// This is a read model for AI prompts, not the editing API — the
// normalized structure (used by GET /api/profile) stays the source
// of truth and is what the profile-setup UI edits.
// ─────────────────────────────────────────

export interface ExportedProfile {
  headers: {
    username: string | null;
    contact: { phone: string | null; email: string };
    links: { linkedin: string | null; github: string | null; portfolio: string | null };
  };
  sections: Array<{
    type: SectionType;
    title: string;
    date: string;
    description: string;
  }>;
}

export function buildHeaders(user: User, profile: Profile | null): ExportedProfile['headers'] {
  return {
    username: user.name,
    contact: { phone: profile?.phone ?? null, email: user.email },
    links: {
      linkedin: profile?.linkedin ?? null,
      github: profile?.github ?? null,
      portfolio: profile?.portfolio ?? null,
    },
  };
}

function dateRange(start?: string | null, end?: string | null, current?: boolean): string {
  if (!start) return end ?? '';
  return `${start} – ${current ? 'Present' : (end ?? 'Present')}`;
}

function joinBullets(bullets: unknown): string {
  return Array.isArray(bullets) ? bullets.filter((b) => typeof b === 'string').join(' ') : '';
}

function formatWorkExperience(d: Record<string, any>): { title: string; date: string; description: string } {
  const title = [d.title, d.company].filter(Boolean).join(' — ');
  const date = dateRange(d.startDate, d.endDate, d.current);
  const description = [d.location, joinBullets(d.bullets)].filter(Boolean).join('. ');
  return { title, date, description };
}

function formatEducation(d: Record<string, any>): { title: string; date: string; description: string } {
  const degreeAndField = [d.degree, d.field ? `in ${d.field}` : null].filter(Boolean).join(' ');
  const title = [degreeAndField, d.school].filter(Boolean).join(' — ');
  const date = dateRange(d.startDate, d.endDate);
  const description = [joinBullets(d.bullets), d.gpa ? `GPA: ${d.gpa}` : null].filter(Boolean).join('. ');
  return { title, date, description };
}

function formatSkills(d: Record<string, any>): { title: string; date: string; description: string } {
  const title = d.category ?? '';
  const description = Array.isArray(d.skills) ? d.skills.join(', ') : '';
  return { title, date: '', description };
}

function formatProjects(d: Record<string, any>): { title: string; date: string; description: string } {
  const title = d.name ?? '';
  const date = dateRange(d.startDate, d.endDate, d.current);
  const description = [d.url, joinBullets(d.bullets)].filter(Boolean).join('. ');
  return { title, date, description };
}

function formatCertifications(d: Record<string, any>): { title: string; date: string; description: string } {
  const title = d.name ?? '';
  const date = d.date ?? '';
  const description = [d.issuer ? `Issued by ${d.issuer}` : null, d.url].filter(Boolean).join('. ');
  return { title, date, description };
}

function formatAwards(d: Record<string, any>): { title: string; date: string; description: string } {
  const title = d.title ?? '';
  const date = d.date ?? '';
  const description = [d.issuer, d.description].filter(Boolean).join('. ');
  return { title, date, description };
}

function formatLanguages(d: Record<string, any>): { title: string; date: string; description: string } {
  const title = d.language ?? '';
  const description = d.proficiency ?? '';
  return { title, date: '', description };
}

function formatVolunteer(d: Record<string, any>): { title: string; date: string; description: string } {
  const title = [d.role ?? 'Volunteer', d.organization].filter(Boolean).join(' — ');
  const date = dateRange(d.startDate, d.endDate, d.current);
  const description = joinBullets(d.bullets);
  return { title, date, description };
}

const FORMATTERS: Record<SectionType, (data: Record<string, any>) => { title: string; date: string; description: string }> = {
  WORK_EXPERIENCE: formatWorkExperience,
  EDUCATION: formatEducation,
  SKILLS: formatSkills,
  PROJECTS: formatProjects,
  CERTIFICATIONS: formatCertifications,
  AWARDS: formatAwards,
  LANGUAGES: formatLanguages,
  VOLUNTEER: formatVolunteer,
};

export function formatInstance(
  type: SectionType,
  instance: Pick<ProfileInstance, 'data'>
): ExportedProfile['sections'][number] {
  const { title, date, description } = FORMATTERS[type](instance.data as Record<string, any>);
  return { type, title, date, description };
}
