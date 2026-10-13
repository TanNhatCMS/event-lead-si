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
    profileSettings: z.string().min(1),
    scanCard: z.string().min(1),
    aiModels: z.string().min(1),
    contacts: z.string().min(1),
    companies: z.string().min(1),
    sourcing: z.string().min(1),
    relationships: z.string().min(1),
    auditLog: z.string().min(1),
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
    home: '/home',
    profileSettings: '/home/settings',
    scanCard: '/home/quet-danh-thiep',
    aiModels: '/home/cai-dat/ai-models',
    contacts: '/home/danh-ba',
    companies: '/home/cong-ty',
    sourcing: '/home/sourcing',
    relationships: '/home/quan-he',
    auditLog: '/home/nhat-ky',
  },
} satisfies z.infer<typeof PathsSchema>);

export default pathsConfig;
