import { z } from 'zod';

export const MaterialSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  unit: z.string().min(1, 'Unit is required').max(20),
  category: z.string().max(100).optional(),
  categoryId: z.string().max(100).optional(),
  warehouse: z.string().max(100).optional(),
  warehouseId: z.string().max(100).optional(),
  stockType: z.string().min(1, 'Stock type is required').max(50),
  allowNegativeConsumption: z.boolean().optional(),
  externalItemName: z.string().max(100).optional(),
  currentStock: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
});

export type MaterialInput = z.infer<typeof MaterialSchema>;
