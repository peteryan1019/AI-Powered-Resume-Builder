export interface AuthUser {
  id: string;
  email: string;
  googleid: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

