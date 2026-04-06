import { z } from 'zod';

export const TransactionSchema = z.object({
  type:                z.enum(['STOCK_IN', 'STOCK_OUT', 'RETURN']),
  materialId:          z.string().min(1, 'Material is required'),
  quantity:            z.number().min(0.001, 'Quantity must be greater than 0'),
  jobId:               z.string().optional().nullable(),
  parentTransactionId: z.string().optional().nullable(),
  notes:               z.string().max(500).optional(),
  date:                z.string().optional(),
});

export type TransactionInput = z.infer<typeof TransactionSchema>;
