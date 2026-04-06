import { z } from 'zod';

export const CustomerSchema = z.object({
  name:          z.string().min(1, 'Name is required').max(100),
  contactPerson: z.string().max(100).optional(),
  phone:         z.string().max(20).optional(),
  email:         z.string().email('Invalid email').optional().or(z.literal('')),
  address:       z.string().max(300).optional(),
});

export type CustomerInput = z.infer<typeof CustomerSchema>;
