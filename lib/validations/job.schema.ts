import { z } from 'zod';

export const JobSchema = z.object({
  jobNumber:   z.string().min(1, 'Job number is required').max(50),
  customerId:  z.string().min(1, 'Customer is required'),
  description: z.string().min(1, 'Description is required').max(500),
  site:        z.string().max(200).optional(),
  status:      z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).default('ACTIVE'),
  startDate:   z.string().optional(),
  endDate:     z.string().optional(),
});

export type JobInput = z.infer<typeof JobSchema>;
