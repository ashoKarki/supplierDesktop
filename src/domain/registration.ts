import { z } from "zod";

export const registrationSchema = z.object({
  administratorName: z.string().trim().min(1).max(200),
  email: z.string().trim().max(254).email().toLowerCase(),
  password: z.string().min(12).max(128),
  companyName: z.string().trim().min(1).max(200),
  country: z.string().regex(/^[A-Z]{2}$/),
  businessDetails: z.string().trim().min(1).max(2000),
});

export type Registration = z.infer<typeof registrationSchema>;
