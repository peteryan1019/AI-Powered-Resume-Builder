// frontend/src/app/features/profile/profile.types.ts

export type SectionType =
  | 'WORK_EXPERIENCE'
  | 'EDUCATION'
  | 'SKILLS'
  | 'PROJECTS'
  | 'CERTIFICATIONS'
  | 'AWARDS'
  | 'LANGUAGES'
  | 'VOLUNTEER';

export interface ProfileInstance {
  id: string;
  sectionId: string;
  order: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSection {
  id: string;
  profileId: string;
  type: SectionType;
  label: string;
  order: number;
  instances: ProfileInstance[];
}

// name/email/avatar come from the User table (populated by auth),
// returned alongside the profile and shown read-only in the form.
export interface ProfileUser {
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface Profile {
  id: string;
  userId: string;

  // Basic info
  headline: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;

  // Links
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;

  // Resume file
  resumeUrl: string | null;
  resumeFileName: string | null;

  sections: ProfileSection[];
}

// ── Per-section data shapes ─────────────────────────────────────
// These match the JSON stored in ProfileInstance.data.
// Use these when building/reading instance forms.

// The simplified forms collect one free-text `description` per entry instead of
// a summary, a technologies list, and a bullet array. The resume AI turns that
// prose into tailored bullet points at generation time.
//
// The legacy fields below are still declared because rows saved before the
// simplification keep their old JSON in ProfileInstance.data — there is no
// migration. Read them, never write them; backend/src/lib/profileExport.ts
// merges both shapes when it exports a profile to the AI.
interface LegacyEntryFields {
  /** @deprecated superseded by `description` */
  summary?: string;
  /** @deprecated superseded by `description` */
  technologies?: string[];
  /** @deprecated superseded by `description` */
  bullets?: string[];
  /** @deprecated superseded by `description` */
  customDetails?: Array<{ label: string; value: string }>;
}

export interface WorkExperienceData extends LegacyEntryFields {
  company: string;
  title: string;
  location?: string;
  startDate: string;   // 'YYYY-MM'
  endDate?: string;
  current: boolean;
  description?: string;
}

export interface EducationData extends LegacyEntryFields {
  school: string;
  degree: string;
  field?: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
  description?: string;
}

export interface SkillsData {
  category: string;
  skills: string[];
}

export interface ProjectData extends LegacyEntryFields {
  name: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  current: boolean;
  description?: string;
}

export interface CertificationData {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}

export interface AwardData {
  title: string;
  issuer?: string;
  date?: string;
  description?: string;
}

export interface LanguageData {
  language: string;
  proficiency?: string;
}

export interface VolunteerData extends LegacyEntryFields {
  organization: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  current: boolean;
  description?: string;
}

// Map SectionType → its data type
export type InstanceDataMap = {
  WORK_EXPERIENCE: WorkExperienceData;
  EDUCATION: EducationData;
  SKILLS: SkillsData;
  PROJECTS: ProjectData;
  CERTIFICATIONS: CertificationData;
  AWARDS: AwardData;
  LANGUAGES: LanguageData;
  VOLUNTEER: VolunteerData;
};

// Display config per section type (used for icons + labels in UI)
export const SECTION_CONFIG: Record<SectionType, { label: string; icon: string; addLabel: string }> = {
  WORK_EXPERIENCE:  { label: 'Work experience',  icon: 'ti-briefcase',    addLabel: 'Add position'      },
  EDUCATION:        { label: 'Education',         icon: 'ti-school',       addLabel: 'Add degree'        },
  SKILLS:           { label: 'Skills',            icon: 'ti-terminal-2',   addLabel: 'Add skill category' },
  PROJECTS:         { label: 'Projects',          icon: 'ti-code',         addLabel: 'Add project'       },
  CERTIFICATIONS:   { label: 'Certifications',    icon: 'ti-certificate',  addLabel: 'Add certification' },
  AWARDS:           { label: 'Awards',             icon: 'ti-trophy',       addLabel: 'Add award'         },
  LANGUAGES:        { label: 'Languages',          icon: 'ti-language',     addLabel: 'Add language'      },
  VOLUNTEER:        { label: 'Volunteer',          icon: 'ti-heart-handshake', addLabel: 'Add role'       },
};