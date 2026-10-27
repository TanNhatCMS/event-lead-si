import { z } from 'zod';

const PathsSchema = z.object({
  auth: z.object({
    signIn: z.string().min(1),
    signUp: z.string().min(1),
    verifyMfa: z.string().min(1),
    callback: z.string().min(1),
    passwordReset: z.string().min(1),
    passwordUpdate: z.string().min(1),
  }),
  app: z.object({
    home: z.string().min(1),
    admin: z.string().min(1),
    users: z.string().min(1),
    agentTooling: z.string().min(1),
    profileSettings: z.string().min(1),
    scanCard: z.string().min(1),
    aiModels: z.string().min(1),
    aiPrompts: z.string().min(1),
    contacts: z.string().min(1),
    companies: z.string().min(1),
    sourcing: z.string().min(1),
    relationships: z.string().min(1),
    auditLog: z.string().min(1),
    assistant: z.string().min(1),
  }),
});

const pathsConfig = PathsSchema.parse({
  auth: {
    signIn: '/auth/sign-in',
    signUp: '/auth/sign-up',
    verifyMfa: '/auth/verify',
    callback: '/auth/callback',
    passwordReset: '/auth/password-reset',
    passwordUpdate: '/update-password',
  },
  app: {
    home: '/dashboard',
    admin: '/admin',
    users: '/admin/nguoi-dung',
    agentTooling: '/admin/agent',
    profileSettings: '/dashboard/settings',
    scanCard: '/dashboard/quet-danh-thiep',
    aiModels: '/admin/settings',
    aiPrompts: '/admin/prompts',
    contacts: '/dashboard/danh-ba',
    companies: '/dashboard/cong-ty',
    sourcing: '/dashboard/sourcing',
    relationships: '/dashboard/quan-he',
    auditLog: '/admin/nhat-ky',
    assistant: '/dashboard/tro-ly',
  },
} satisfies z.infer<typeof PathsSchema>);

export default pathsConfig;
