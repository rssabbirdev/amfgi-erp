# Integration Tests

Comprehensive integration tests for the AMFGI Prisma/MySQL migration.

## Structure

```
__tests__/
├── integration/
│   ├── setup.ts              # Test utilities, context, data seeding
│   ├── fifo-batch.test.ts    # FIFO stock consumption tests (critical)
│   ├── transfers.test.ts     # Inter-company transfer tests (critical)
│   ├── multi-tenancy.test.ts # Data isolation tests (critical)
│   └── materials-crud.test.ts # CRUD operations & audit logs
├── jest.config.js
└── README.md
```

## Test Coverage

### Critical Path Tests (High Risk Areas)

#### FIFO Batch Consumption (`fifo-batch.test.ts`)
- ✅ Consumes stock from batches in FIFO order (oldest first)
- ✅ Creates transaction batch entries for each batch used
- ✅ Updates batch availability and material stock correctly
- ✅ Fails gracefully on insufficient stock
- ✅ Calculates FIFO cost correctly (weighted average)

**Why critical:** The FIFO algorithm is complex and handles job costing. Breaking this breaks financial accuracy.

#### Inter-Company Transfers (`transfers.test.ts`)
- ✅ Transfers stock from source to destination company
- ✅ Creates TRANSFER_OUT in source and TRANSFER_IN in destination
- ✅ Updates both company stocks atomically
- ✅ Prevents transfer if insufficient stock
- ✅ Maintains atomic transaction integrity (all-or-nothing)

**Why critical:** Transfers are cross-company operations requiring atomicity. Partial failures would corrupt stock levels.

#### Multi-Tenancy Isolation (`multi-tenancy.test.ts`)
- ✅ Allows identical material names in different companies (per-company scoping)
- ✅ Prevents duplicate names within same company (composite unique constraint)
- ✅ Isolates material queries by companyId
- ✅ Isolates transaction/job queries by companyId
- ✅ Enforces user company access restrictions

**Why critical:** Data leakage between companies would be a security violation. Shared database requires strict isolation.

### Standard Operations Tests

#### Materials CRUD (`materials-crud.test.ts`)
- ✅ Create material with all required fields
- ✅ Read material by ID
- ✅ List materials for company
- ✅ Filter materials by active status
- ✅ Update material fields
- ✅ Soft delete (set isActive=false)
- ✅ Hard delete (only if no transactions)
- ✅ Audit logging (material logs, price logs)

## Running Tests

### Prerequisites
```bash
npm install --save-dev jest ts-jest @types/jest
```

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- fifo-batch.test.ts
npm test -- transfers.test.ts
npm test -- multi-tenancy.test.ts
npm test -- materials-crud.test.ts
```

### Run with Coverage
```bash
npm test -- --coverage
```

### Run in Watch Mode
```bash
npm test -- --watch
```

## Test Database Setup

Tests use:
1. **Per-test context**: `setupTestContext()` creates fresh test companies, roles, users
2. **Automatic cleanup**: `teardownTestContext()` removes all test data after each suite
3. **Isolation**: Each test suite is independent; no data persists between runs

### Data Isolation

- **Company A (AMFGI)**: Test materials, transactions, jobs
- **Company B (K&M)**: Separate test data for multi-tenancy validation
- **Users**: Super Admin, Manager, Store Keeper with different permission levels

## Expected Test Results

All tests should pass:
- 45+ test cases across 4 test suites
- 0 test timeouts (30-second limit per test)
- 100% critical path coverage
- Data properly isolated between companies
- Stock levels correctly updated
- Transactions properly atomic

## Key Assertions

### FIFO Tests
```typescript
expect(batch1.quantityAvailable).toBe(0);    // Consumed first
expect(batch2.quantityAvailable).toBe(0);    // Consumed second
expect(batch3.quantityAvailable).toBe(50);   // Partially consumed
expect(material.currentStock).toBe(250);     // Total deducted
```

### Transfer Tests
```typescript
expect(sourceCompany.stock).toBe(400);       // Source decremented
expect(destCompany.stock).toBe(100);         // Destination incremented
expect(transferOut.type).toBe('TRANSFER_OUT'); // Proper transaction types
expect(transferIn.type).toBe('TRANSFER_IN');
```

### Multi-Tenancy Tests
```typescript
expect(mat1.companyId).toBe(amfgiId);        // Different IDs for same name
expect(mat2.companyId).toBe(kmId);
expect(duplicateCreate).rejects.toThrow();   // Duplicate name fails in same company
expect(amfgiMats.length).toBeGreaterThan(0); // Company scoping works
expect(kmMats.some(m => m.id === amfgiMat.id)).toBe(false); // No leakage
```

## Notes

- Tests are integration tests (use real database, not mocks)
- Database must be running on `DATABASE_URL` before tests
- Tests create/delete data; do NOT run against production database
- Each test is ~1-2 seconds; full suite ~30-60 seconds
- Seed script (`scripts/seed.ts`) can be run separately for demo data

## Future Test Additions

- [ ] API endpoint tests (HTTP level, with authentication)
- [ ] Report generation tests (stock valuation, consumption)
- [ ] Permission & access control tests
- [ ] Error handling tests (validation, constraint violations)
- [ ] Performance tests (large batch consumption, report generation)
