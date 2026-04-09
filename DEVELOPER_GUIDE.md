# Prisma/MySQL Developer Guide

Quick reference for working with the migrated AMFGI system.

---

## Quick Start

### Install & Setup
```bash
npm install  # Installs Prisma 6 + @prisma/client + mariadb
npx prisma generate  # Generates Prisma client
npx prisma studio   # Open Prisma Studio GUI (port 5555)
```

### Connect to Database
```bash
# Check .env has DATABASE_URL set
cat .env | grep DATABASE_URL

# Local dev (example)
DATABASE_URL="mysql://root:1234@localhost:3306/amfgi"

# cPanel (example)
DATABASE_URL="mysql://cpaneluser_amfgi:password@localhost:3306/cpaneluser_amfgi"
```

---

## Common Patterns

### 1. List Records (with Company Scoping)
```typescript
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  const companyId = session.user.activeCompanyId;
  
  const materials = await prisma.material.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: 'asc' },
  });
  
  return successResponse(materials);
}
```

### 2. Create Record (with Uniqueness Check)
```typescript
const existing = await prisma.material.findUnique({
  where: {
    companyId_name: {
      companyId: session.user.activeCompanyId,
      name: parsed.data.name,
    },
  },
});

if (existing) return errorResponse('Material with this name already exists', 409);

const material = await prisma.material.create({
  data: {
    ...parsed.data,
    companyId: session.user.activeCompanyId,
    isActive: true,
  },
});
```

### 3. Update with Relation Check
```typescript
const existing = await prisma.material.findUnique({
  where: { id },
});

if (!existing || existing.companyId !== companyId) {
  return errorResponse('Material not found', 404);
}

const updated = await prisma.material.update({
  where: { id },
  data: parsed.data,
  include: { /* optional: relations */ },
});
```

### 4. Atomic Transaction
```typescript
await prisma.$transaction(async (tx) => {
  // All operations succeed or all rollback
  await tx.material.update({ where: { id }, data: { ... } });
  await tx.transaction.create({ data: { ... } });
  // If error thrown here, both updates rollback
});
```

### 5. Include Relations
```typescript
const job = await prisma.job.findUnique({
  where: { id },
  include: {
    customer: true,  // Include Customer relation
    transactions: {  // Include multiple transactions
      where: { type: 'STOCK_OUT' },
      include: { material: { select: { name: true, unit: true } } },
    },
  },
});
```

### 6. Complex Filtering
```typescript
const transactions = await prisma.transaction.findMany({
  where: {
    companyId,
    type: 'STOCK_OUT',
    date: {
      gte: new Date('2026-01-01'),
      lte: new Date('2026-02-01'),
    },
    jobId: jobId || undefined,  // Optional filter
  },
  orderBy: { date: 'desc' },
  take: 50,
});
```

### 7. Group & Count (Client-Side)
```typescript
const batches = await prisma.stockBatch.findMany({
  where: { companyId, receiptNumber: { not: null } },
  include: { material: true },
  orderBy: { receivedDate: 'desc' },
});

// Group by receiptNumber
const grouped = new Map<string, typeof batches>();
batches.forEach((batch) => {
  if (!grouped.has(batch.receiptNumber!)) {
    grouped.set(batch.receiptNumber!, []);
  }
  grouped.get(batch.receiptNumber!)!.push(batch);
});

// Use grouped data
grouped.forEach((lines, receiptNumber) => {
  const totalValue = lines.reduce((sum, l) => sum + l.totalCost, 0);
  console.log(`Receipt ${receiptNumber}: ${totalValue}`);
});
```

---

## Error Handling

### Unique Constraint Error
```typescript
try {
  await prisma.material.create({
    data: { companyId, name: 'Duplicate Name', ... },
  });
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return errorResponse('Material with this name already exists', 409);
  }
  throw err;
}
```

### Not Found Error
```typescript
const material = await prisma.material.findUnique({ where: { id } });
if (!material || material.companyId !== companyId) {
  return errorResponse('Material not found', 404);
}
```

### Transaction Rollback
```typescript
try {
  await prisma.$transaction(async (tx) => {
    if (someCondition) throw new Error('Validation failed');
    // All updates rollback automatically
  });
} catch (err) {
  return errorResponse(err instanceof Error ? err.message : 'Failed', 400);
}
```

---

## Schema Reference

### Core Models
```prisma
model Company {
  id    String @id @default(cuid())
  name  String @unique
  slug  String @unique
  isActive Boolean @default(true)
  users UserCompanyAccess[]
  materials Material[]
  // ... all company-scoped tables
}

model User {
  id    String @id @default(cuid())
  email String @unique
  password String?
  isSuperAdmin Boolean @default(false)
  activeCompanyId String? FK
  companyAccess UserCompanyAccess[]
}

model Material {
  id    String @id @default(cuid())
  companyId String FK  // REQUIRED for all queries
  name  String
  unit  String
  currentStock Float @default(0)
  isActive Boolean @default(true)
  @@unique([companyId, name])  // Composite unique
}

model Transaction {
  id String @id @default(cuid())
  companyId String FK  // REQUIRED
  type TransactionType
  materialId String FK
  quantity Float
  jobId String? FK
  totalCost Float @default(0)
  averageCost Float @default(0)
  date DateTime @default(now())
  batchesUsed TransactionBatch[]  // FIFO tracking
}

model StockBatch {
  id String @id @default(cuid())
  companyId String FK
  materialId String FK
  batchNumber String
  quantityReceived Float
  quantityAvailable Float  // Decrements as consumed via FIFO
  unitCost Float
  receivedDate DateTime
  @@unique([companyId, batchNumber])
}
```

### Key Enums
```prisma
enum TransactionType {
  STOCK_IN
  STOCK_OUT
  RETURN
  TRANSFER_IN
  TRANSFER_OUT
  REVERSAL
}

enum JobStatus {
  ACTIVE
  COMPLETED
  ON_HOLD
  CANCELLED
}

enum MaterialLogAction {
  created
  updated
}

enum PriceSource {
  manual
  bill
}
```

---

## Prisma Commands

```bash
# Inspect database schema
npx prisma db pull

# Generate client after schema changes
npx prisma generate

# Create & apply migration (dev only)
npx prisma migrate dev --name description

# Deploy migrations (production)
npx prisma migrate deploy

# View GUI (localhost:5555)
npx prisma studio

# Validate schema
npx prisma validate

# Format schema
npx prisma format
```

---

## Performance Tips

1. **Use `.include()` instead of N+1 queries**
   ```typescript
   // ✅ Good: One query with include
   const job = await prisma.job.findUnique({
     where: { id },
     include: { customer: true, transactions: true },
   });
   
   // ❌ Bad: Three queries (N+1)
   const job = await prisma.job.findUnique({ where: { id } });
   const customer = await prisma.customer.findUnique({ where: { id: job.customerId } });
   const transactions = await prisma.transaction.findMany({ where: { jobId } });
   ```

2. **Use `.select()` to limit fields**
   ```typescript
   // ✅ Good: Only fetch needed fields
   const materials = await prisma.material.findMany({
     where: { companyId },
     select: { id: true, name: true, unit: true },  // Excludes currentStock, etc.
   });
   ```

3. **Batch operations**
   ```typescript
   // ✅ Good: Single query with multiple results
   const materials = await prisma.material.findMany({
     where: { companyId, id: { in: materialIds } },
   });
   
   // ❌ Bad: Loop of queries
   for (const id of materialIds) {
     await prisma.material.findUnique({ where: { id } });
   }
   ```

4. **Use `take` and `skip` for pagination**
   ```typescript
   const page = 1;
   const pageSize = 20;
   
   const materials = await prisma.material.findMany({
     where: { companyId, isActive: true },
     skip: (page - 1) * pageSize,
     take: pageSize,
     orderBy: { createdAt: 'desc' },
   });
   ```

---

## Debugging

### Enable Query Logging
```typescript
// In lib/db/prisma.ts
const prisma = new PrismaClient({
  log: [
    { emit: 'stdout', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' },
  ],
});
```

### Inspect Query
```typescript
// Use Prisma Studio
npx prisma studio

// Or check network tab in browser DevTools
// Each API route prints error details to console
console.error('Query failed:', err);
```

### Test Transaction Rollback
```typescript
try {
  await prisma.$transaction(async (tx) => {
    await tx.material.update({ ... });
    throw new Error('Test rollback');  // Forces rollback
  });
} catch (err) {
  console.log('Rolled back as expected');
}
```

---

## Migration Checklist for New Features

When adding a new API endpoint:

- [ ] Import `{ prisma }` from `@/lib/db/prisma`
- [ ] Add `if (!session.user.activeCompanyId) return errorResponse(...)`
- [ ] Include `companyId: session.user.activeCompanyId` in ALL `where` clauses
- [ ] Verify composite unique constraints (e.g., `companyId_name`)
- [ ] Test with multiple companies (ensure no data leaks)
- [ ] Use `.include()` or `.select()` to optimize queries
- [ ] Wrap multi-step updates in `prisma.$transaction()`
- [ ] Handle Prisma-specific errors (P2002 for unique, P2025 for not found)
- [ ] Test in local MySQL before deploying to cPanel

---

## Common Issues & Solutions

### Issue: "Environment variable not found: DATABASE_URL"
**Solution:** Ensure `.env` file exists and `DATABASE_URL` is set, then restart dev server.

### Issue: "Error: P2014: The change you are trying to make would violate a required relation"
**Solution:** Ensure foreign key constraints are satisfied (e.g., material must exist before creating transaction).

### Issue: "Relations require an FK field in the view"
**Solution:** Use `.include()` instead of direct navigation when the FK is not selected.

### Issue: Transactions are slower after migration
**Solution:** Check indexes with `npx prisma db pull` and add `@@index([companyId, date])` if missing.

---

## Useful Links

- **Prisma Docs:** https://www.prisma.io/docs/
- **MySQL & Prisma:** https://www.prisma.io/docs/orm/overview/databases/mysql
- **Composite Unique:** https://www.prisma.io/docs/orm/reference/prisma-schema-reference#unique
- **Transactions:** https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- **Aggregations:** https://www.prisma.io/docs/orm/prisma-client/aggregations-grouping/aggregation-api
- **Error Handling:** https://www.prisma.io/docs/orm/reference/error-reference

