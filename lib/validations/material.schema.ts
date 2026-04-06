import { z } from 'zod';

export const MaterialSchema = z.object({
  name:         z.string().min(1, 'Name is required').max(100),
  unit:         z.string().min(1, 'Unit is required').max(20),
  category:     z.string().max(50).optional(),
  currentStock: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).optional(),
  unitCost:     z.number().min(0).optional(),
});

export type MaterialInput = z.infer<typeof MaterialSchema>;
