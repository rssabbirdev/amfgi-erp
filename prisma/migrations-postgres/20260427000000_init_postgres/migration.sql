-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED');

-- CreateEnum
CREATE TYPE "VisaPeriodStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AssignmentLocationType" AS ENUM ('SITE_JOB', 'FACTORY', 'OTHER');

-- CreateEnum
CREATE TYPE "AssignmentMemberRole" AS ENUM ('WORKER', 'HELPER', 'TEAM_LEADER');

-- CreateEnum
CREATE TYPE "AttendanceEntryStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'MISSING_PUNCH');

-- CreateEnum
CREATE TYPE "AttendanceWorkflowStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('SCHEDULE_BOILERPLATE', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "GeofenceAttendanceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'LOCATION_PING', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "GeofenceValidationStatus" AS ENUM ('VALID', 'OUTSIDE_POLYGON', 'OUTSIDE_GATE_RADIUS');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialLogAction" AS ENUM ('created', 'updated');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('manual', 'bill');

-- CreateEnum
CREATE TYPE "PartyRecordSource" AS ENUM ('LOCAL', 'PARTY_API_SYNC');

-- CreateEnum
CREATE TYPE "JobRecordSource" AS ENUM ('LOCAL', 'EXTERNAL_API');

-- CreateEnum
CREATE TYPE "JobSourceMode" AS ENUM ('HYBRID', 'EXTERNAL_ONLY');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "externalCompanyId" TEXT,
    "jobSourceMode" "JobSourceMode" NOT NULL DEFAULT 'HYBRID',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "jobCostingSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "email" TEXT,
    "letterheadDriveId" TEXT,
    "letterheadUrl" TEXT,
    "printTemplates" JSONB,
    "hrEmployeeTypeSettings" JSONB,
    "phone" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "image" TEXT,
    "imageDriveId" TEXT,
    "signatureUrl" TEXT,
    "signatureDriveId" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "linkedEmployeeId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "fileName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "bytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAssetLink" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "MediaAssetLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompanyAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserCompanyAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "category" TEXT,
    "categoryId" TEXT,
    "warehouse" TEXT,
    "warehouseId" TEXT,
    "stockType" TEXT NOT NULL,
    "allowNegativeConsumption" BOOLEAN NOT NULL DEFAULT false,
    "externalItemName" TEXT,
    "currentStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(18,3),
    "unitCost" DECIMAL(18,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialUom" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "parentUomId" TEXT,
    "factorToParent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialUom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantityReceived" DECIMAL(18,3) NOT NULL,
    "quantityAvailable" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "supplier" TEXT,
    "supplierId" TEXT,
    "receiptNumber" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "jobId" TEXT,
    "parentTransactionId" TEXT,
    "counterpartCompany" TEXT,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT NOT NULL,
    "performedByUserId" TEXT,
    "performedByName" TEXT,
    "totalCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeliveryNote" BOOLEAN NOT NULL DEFAULT false,
    "signedCopyDriveId" TEXT,
    "signedCopyUrl" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionBatch" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantityFromBatch" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "costAmount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "TransactionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "externalJobId" TEXT,
    "jobNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "description" TEXT,
    "site" TEXT,
    "address" TEXT,
    "locationName" TEXT,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "quotationNumber" TEXT,
    "quotationDate" TIMESTAMP(3),
    "lpoNumber" TEXT,
    "lpoDate" TIMESTAMP(3),
    "lpoValue" DECIMAL(18,2),
    "projectName" TEXT,
    "projectDetails" TEXT,
    "contactPerson" TEXT,
    "salesPerson" TEXT,
    "jobWorkValue" DECIMAL(18,2),
    "finishedGoods" JSONB,
    "source" "JobRecordSource" NOT NULL DEFAULT 'LOCAL',
    "externalUpdatedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "parentJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "label" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "number" TEXT,
    "designation" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceExpertise" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceExpertise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRequiredExpertise" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "expertiseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRequiredExpertise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "allowedDomains" JSONB,
    "scopes" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLpoValueHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "previousValue" DECIMAL(18,2),
    "newValue" DECIMAL(18,2),
    "changedBy" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLpoValueHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSyncLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "credentialId" TEXT,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "entityType" TEXT NOT NULL DEFAULT 'job',
    "entityKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "httpStatus" INTEGER,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" "PartyRecordSource" NOT NULL DEFAULT 'LOCAL',
    "externalPartyId" INTEGER,
    "externalSyncedAt" TIMESTAMP(3),
    "tradeLicenseNumber" TEXT,
    "tradeLicenseAuthority" VARCHAR(255),
    "tradeLicenseExpiry" TIMESTAMP(3),
    "trnNumber" TEXT,
    "trnExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalContactId" INTEGER,
    "contactName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "externalCreatedAt" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" "PartyRecordSource" NOT NULL DEFAULT 'LOCAL',
    "externalPartyId" INTEGER,
    "externalSyncedAt" TIMESTAMP(3),
    "tradeLicenseNumber" TEXT,
    "tradeLicenseAuthority" VARCHAR(255),
    "tradeLicenseExpiry" TIMESTAMP(3),
    "trnNumber" TEXT,
    "trnExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "externalContactId" INTEGER,
    "contactName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "externalCreatedAt" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "action" "MaterialLogAction" NOT NULL,
    "changes" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "previousPrice" DECIMAL(18,4) NOT NULL,
    "currentPrice" DECIMAL(18,4) NOT NULL,
    "source" "PriceSource" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "billId" TEXT,
    "notes" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulaLibrary" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fabricationType" TEXT NOT NULL,
    "description" TEXT,
    "specificationSchema" JSONB,
    "formulaConfig" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormulaLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "formulaLibraryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "specifications" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItemAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobItemAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "preferredName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "nationality" TEXT,
    "dateOfBirth" DATE,
    "gender" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "employmentType" TEXT,
    "hireDate" DATE,
    "terminationDate" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "bloodGroup" TEXT,
    "photoDriveId" TEXT,
    "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "adminNotes" TEXT,
    "profileExtension" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sponsorType" TEXT,
    "visaType" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "VisaPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocumentType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "requiresVisaPeriod" BOOLEAN NOT NULL DEFAULT false,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT true,
    "defaultAlertDaysBeforeExpiry" INTEGER NOT NULL DEFAULT 30,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "visaPeriodId" TEXT,
    "documentTypeId" TEXT NOT NULL,
    "documentNumber" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "issuingAuthority" TEXT,
    "notes" TEXT,
    "customFields" JSONB,
    "mediaDriveId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "clientDisplayName" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "status" "WorkScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workScheduleId" TEXT NOT NULL,
    "columnIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "locationType" "AssignmentLocationType" NOT NULL DEFAULT 'SITE_JOB',
    "jobId" TEXT,
    "factoryCode" TEXT,
    "factoryLabel" TEXT,
    "jobNumberSnapshot" TEXT,
    "siteNameSnapshot" TEXT,
    "clientNameSnapshot" TEXT,
    "projectDetailsSnapshot" TEXT,
    "teamLeaderEmployeeId" TEXT,
    "driver1EmployeeId" TEXT,
    "driver2EmployeeId" TEXT,
    "shiftStart" TEXT,
    "shiftEnd" TEXT,
    "breakWindow" TEXT,
    "targetQty" DECIMAL(18,3),
    "achievedQty" DECIMAL(18,3),
    "unit" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAssignmentMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workAssignmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "AssignmentMemberRole" NOT NULL DEFAULT 'WORKER',
    "slot" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkAssignmentMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAbsence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workScheduleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverRunLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workScheduleId" TEXT NOT NULL,
    "driverEmployeeId" TEXT NOT NULL,
    "routeText" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "workAssignmentId" TEXT,
    "expectedShiftStart" TIMESTAMP(3),
    "expectedShiftEnd" TIMESTAMP(3),
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "breakStartAt" TIMESTAMP(3),
    "breakEndAt" TIMESTAMP(3),
    "status" "AttendanceEntryStatus" NOT NULL DEFAULT 'PRESENT',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "workflowStatus" "AttendanceWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "AttendanceSource" NOT NULL DEFAULT 'SCHEDULE_BOILERPLATE',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeofenceZone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "polygonPoints" JSONB NOT NULL,
    "gateLat" DOUBLE PRECISION NOT NULL,
    "gateLng" DOUBLE PRECISION NOT NULL,
    "gateRadiusMeters" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeofenceZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeofenceAttendanceEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "employeeId" TEXT,
    "workDate" DATE,
    "eventType" "GeofenceAttendanceEventType" NOT NULL,
    "validationStatus" "GeofenceValidationStatus" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "distanceToGateMeters" DOUBLE PRECISION,
    "insidePolygon" BOOLEAN NOT NULL DEFAULT false,
    "withinGateRadius" BOOLEAN NOT NULL DEFAULT false,
    "devicePlatform" TEXT,
    "deviceIdentifier" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeofenceAttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeMobileAccessToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tokenLabel" TEXT,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeMobileAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_externalCompanyId_key" ON "Company"("externalCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_linkedEmployeeId_key" ON "User"("linkedEmployeeId");

-- CreateIndex
CREATE INDEX "User_activeCompanyId_idx" ON "User"("activeCompanyId");

-- CreateIndex
CREATE INDEX "MediaAsset_companyId_category_idx" ON "MediaAsset"("companyId", "category");

-- CreateIndex
CREATE INDEX "MediaAsset_companyId_createdAt_idx" ON "MediaAsset"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_companyId_driveId_key" ON "MediaAsset"("companyId", "driveId");

-- CreateIndex
CREATE INDEX "MediaAssetLink_assetId_idx" ON "MediaAssetLink"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAssetLink_kind_entityId_key" ON "MediaAssetLink"("kind", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_slug_key" ON "Role"("slug");

-- CreateIndex
CREATE INDEX "UserCompanyAccess_companyId_idx" ON "UserCompanyAccess"("companyId");

-- CreateIndex
CREATE INDEX "UserCompanyAccess_roleId_idx" ON "UserCompanyAccess"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompanyAccess_userId_companyId_key" ON "UserCompanyAccess"("userId", "companyId");

-- CreateIndex
CREATE INDEX "Material_companyId_isActive_idx" ON "Material"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "Material_companyId_categoryId_idx" ON "Material"("companyId", "categoryId");

-- CreateIndex
CREATE INDEX "Material_companyId_warehouseId_idx" ON "Material"("companyId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_companyId_id_key" ON "Material"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Material_companyId_name_key" ON "Material"("companyId", "name");

-- CreateIndex
CREATE INDEX "MaterialUom_companyId_materialId_idx" ON "MaterialUom"("companyId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialUom_materialId_unitId_key" ON "MaterialUom"("materialId", "unitId");

-- CreateIndex
CREATE INDEX "StockBatch_companyId_materialId_receivedDate_idx" ON "StockBatch"("companyId", "materialId", "receivedDate");

-- CreateIndex
CREATE INDEX "StockBatch_companyId_materialId_quantityAvailable_idx" ON "StockBatch"("companyId", "materialId", "quantityAvailable");

-- CreateIndex
CREATE INDEX "StockBatch_receiptNumber_idx" ON "StockBatch"("receiptNumber");

-- CreateIndex
CREATE INDEX "StockBatch_companyId_supplierId_idx" ON "StockBatch"("companyId", "supplierId");

-- CreateIndex
CREATE INDEX "StockBatch_materialId_fkey" ON "StockBatch"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_companyId_batchNumber_key" ON "StockBatch"("companyId", "batchNumber");

-- CreateIndex
CREATE INDEX "Transaction_companyId_date_idx" ON "Transaction"("companyId", "date");

-- CreateIndex
CREATE INDEX "Transaction_companyId_jobId_materialId_idx" ON "Transaction"("companyId", "jobId", "materialId");

-- CreateIndex
CREATE INDEX "Transaction_companyId_materialId_type_idx" ON "Transaction"("companyId", "materialId", "type");

-- CreateIndex
CREATE INDEX "Transaction_companyId_parentTransactionId_idx" ON "Transaction"("companyId", "parentTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_performedByUserId_idx" ON "Transaction"("performedByUserId");

-- CreateIndex
CREATE INDEX "Transaction_jobId_fkey" ON "Transaction"("jobId");

-- CreateIndex
CREATE INDEX "Transaction_materialId_fkey" ON "Transaction"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_companyId_id_key" ON "Transaction"("companyId", "id");

-- CreateIndex
CREATE INDEX "TransactionBatch_transactionId_idx" ON "TransactionBatch"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionBatch_batchId_idx" ON "TransactionBatch"("batchId");

-- CreateIndex
CREATE INDEX "Job_companyId_status_idx" ON "Job"("companyId", "status");

-- CreateIndex
CREATE INDEX "Job_companyId_customerId_idx" ON "Job"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "Job_companyId_parentJobId_idx" ON "Job"("companyId", "parentJobId");

-- CreateIndex
CREATE INDEX "Job_companyId_source_idx" ON "Job"("companyId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_id_key" ON "Job"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_jobNumber_key" ON "Job"("companyId", "jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_externalJobId_key" ON "Job"("companyId", "externalJobId");

-- CreateIndex
CREATE INDEX "JobContact_companyId_jobId_sortOrder_idx" ON "JobContact"("companyId", "jobId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkforceExpertise_companyId_isActive_sortOrder_idx" ON "WorkforceExpertise"("companyId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceExpertise_companyId_id_key" ON "WorkforceExpertise"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceExpertise_companyId_name_key" ON "WorkforceExpertise"("companyId", "name");

-- CreateIndex
CREATE INDEX "JobRequiredExpertise_companyId_jobId_sortOrder_idx" ON "JobRequiredExpertise"("companyId", "jobId", "sortOrder");

-- CreateIndex
CREATE INDEX "JobRequiredExpertise_companyId_expertiseId_idx" ON "JobRequiredExpertise"("companyId", "expertiseId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRequiredExpertise_jobId_expertiseId_key" ON "JobRequiredExpertise"("jobId", "expertiseId");

-- CreateIndex
CREATE INDEX "ApiCredential_companyId_revokedAt_idx" ON "ApiCredential"("companyId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_companyId_keyPrefix_key" ON "ApiCredential"("companyId", "keyPrefix");

-- CreateIndex
CREATE INDEX "JobLpoValueHistory_companyId_createdAt_idx" ON "JobLpoValueHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "JobLpoValueHistory_companyId_jobId_createdAt_idx" ON "JobLpoValueHistory"("companyId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_companyId_createdAt_idx" ON "IntegrationSyncLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_companyId_status_idx" ON "IntegrationSyncLog"("companyId", "status");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_credentialId_idx" ON "IntegrationSyncLog"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationSyncLog_companyId_idempotencyKey_key" ON "IntegrationSyncLog"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Customer_companyId_name_idx" ON "Customer"("companyId", "name");

-- CreateIndex
CREATE INDEX "Customer_companyId_isActive_idx" ON "Customer"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "Customer_companyId_source_idx" ON "Customer"("companyId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_id_key" ON "Customer"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_externalPartyId_key" ON "Customer"("companyId", "externalPartyId");

-- CreateIndex
CREATE INDEX "CustomerContact_companyId_customerId_sortOrder_idx" ON "CustomerContact"("companyId", "customerId", "sortOrder");

-- CreateIndex
CREATE INDEX "CustomerContact_companyId_externalContactId_idx" ON "CustomerContact"("companyId", "externalContactId");

-- CreateIndex
CREATE INDEX "Supplier_companyId_name_idx" ON "Supplier"("companyId", "name");

-- CreateIndex
CREATE INDEX "Supplier_companyId_isActive_idx" ON "Supplier"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "Supplier_companyId_source_idx" ON "Supplier"("companyId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_id_key" ON "Supplier"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_externalPartyId_key" ON "Supplier"("companyId", "externalPartyId");

-- CreateIndex
CREATE INDEX "SupplierContact_companyId_supplierId_sortOrder_idx" ON "SupplierContact"("companyId", "supplierId", "sortOrder");

-- CreateIndex
CREATE INDEX "SupplierContact_companyId_externalContactId_idx" ON "SupplierContact"("companyId", "externalContactId");

-- CreateIndex
CREATE INDEX "Unit_companyId_isActive_idx" ON "Unit"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_companyId_name_key" ON "Unit"("companyId", "name");

-- CreateIndex
CREATE INDEX "Category_companyId_isActive_idx" ON "Category"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_id_key" ON "Category"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");

-- CreateIndex
CREATE INDEX "Warehouse_companyId_isActive_idx" ON "Warehouse"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_id_key" ON "Warehouse"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_name_key" ON "Warehouse"("companyId", "name");

-- CreateIndex
CREATE INDEX "MaterialLog_companyId_materialId_timestamp_idx" ON "MaterialLog"("companyId", "materialId", "timestamp");

-- CreateIndex
CREATE INDEX "PriceLog_companyId_materialId_timestamp_idx" ON "PriceLog"("companyId", "materialId", "timestamp");

-- CreateIndex
CREATE INDEX "FormulaLibrary_companyId_fabricationType_isActive_idx" ON "FormulaLibrary"("companyId", "fabricationType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FormulaLibrary_companyId_id_key" ON "FormulaLibrary"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FormulaLibrary_companyId_slug_key" ON "FormulaLibrary"("companyId", "slug");

-- CreateIndex
CREATE INDEX "JobItem_companyId_jobId_isActive_idx" ON "JobItem"("companyId", "jobId", "isActive");

-- CreateIndex
CREATE INDEX "JobItem_companyId_formulaLibraryId_idx" ON "JobItem"("companyId", "formulaLibraryId");

-- CreateIndex
CREATE UNIQUE INDEX "JobItem_companyId_id_key" ON "JobItem"("companyId", "id");

-- CreateIndex
CREATE INDEX "JobItemAssignment_companyId_jobItemId_sortOrder_idx" ON "JobItemAssignment"("companyId", "jobItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "JobItemAssignment_companyId_employeeId_idx" ON "JobItemAssignment"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "JobItemAssignment_jobItemId_employeeId_key" ON "JobItemAssignment"("jobItemId", "employeeId");

-- CreateIndex
CREATE INDEX "Employee_companyId_status_idx" ON "Employee"("companyId", "status");

-- CreateIndex
CREATE INDEX "Employee_companyId_fullName_idx" ON "Employee"("companyId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_id_key" ON "Employee"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_employeeCode_key" ON "Employee"("companyId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_email_key" ON "Employee"("companyId", "email");

-- CreateIndex
CREATE INDEX "VisaPeriod_companyId_employeeId_idx" ON "VisaPeriod"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "VisaPeriod_employeeId_status_idx" ON "VisaPeriod"("employeeId", "status");

-- CreateIndex
CREATE INDEX "VisaPeriod_companyId_endDate_idx" ON "VisaPeriod"("companyId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "VisaPeriod_companyId_id_key" ON "VisaPeriod"("companyId", "id");

-- CreateIndex
CREATE INDEX "EmployeeDocumentType_companyId_isActive_idx" ON "EmployeeDocumentType"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocumentType_companyId_id_key" ON "EmployeeDocumentType"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocumentType_companyId_slug_key" ON "EmployeeDocumentType"("companyId", "slug");

-- CreateIndex
CREATE INDEX "EmployeeDocument_companyId_employeeId_idx" ON "EmployeeDocument"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_companyId_expiryDate_idx" ON "EmployeeDocument"("companyId", "expiryDate");

-- CreateIndex
CREATE INDEX "EmployeeDocument_companyId_visaPeriodId_idx" ON "EmployeeDocument"("companyId", "visaPeriodId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_companyId_documentTypeId_idx" ON "EmployeeDocument"("companyId", "documentTypeId");

-- CreateIndex
CREATE INDEX "WorkSchedule_companyId_status_idx" ON "WorkSchedule"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSchedule_companyId_id_key" ON "WorkSchedule"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSchedule_companyId_workDate_key" ON "WorkSchedule"("companyId", "workDate");

-- CreateIndex
CREATE INDEX "WorkAssignment_companyId_workScheduleId_idx" ON "WorkAssignment"("companyId", "workScheduleId");

-- CreateIndex
CREATE INDEX "WorkAssignment_companyId_jobId_idx" ON "WorkAssignment"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "WorkAssignment_companyId_teamLeaderEmployeeId_idx" ON "WorkAssignment"("companyId", "teamLeaderEmployeeId");

-- CreateIndex
CREATE INDEX "WorkAssignment_companyId_driver1EmployeeId_idx" ON "WorkAssignment"("companyId", "driver1EmployeeId");

-- CreateIndex
CREATE INDEX "WorkAssignment_companyId_driver2EmployeeId_idx" ON "WorkAssignment"("companyId", "driver2EmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkAssignment_companyId_id_key" ON "WorkAssignment"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkAssignment_workScheduleId_columnIndex_key" ON "WorkAssignment"("workScheduleId", "columnIndex");

-- CreateIndex
CREATE INDEX "WorkAssignmentMember_companyId_workAssignmentId_idx" ON "WorkAssignmentMember"("companyId", "workAssignmentId");

-- CreateIndex
CREATE INDEX "WorkAssignmentMember_companyId_employeeId_idx" ON "WorkAssignmentMember"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkAssignmentMember_workAssignmentId_employeeId_key" ON "WorkAssignmentMember"("workAssignmentId", "employeeId");

-- CreateIndex
CREATE INDEX "ScheduleAbsence_companyId_workScheduleId_idx" ON "ScheduleAbsence"("companyId", "workScheduleId");

-- CreateIndex
CREATE INDEX "ScheduleAbsence_companyId_employeeId_idx" ON "ScheduleAbsence"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAbsence_workScheduleId_employeeId_key" ON "ScheduleAbsence"("workScheduleId", "employeeId");

-- CreateIndex
CREATE INDEX "DriverRunLog_companyId_workScheduleId_idx" ON "DriverRunLog"("companyId", "workScheduleId");

-- CreateIndex
CREATE INDEX "DriverRunLog_companyId_driverEmployeeId_idx" ON "DriverRunLog"("companyId", "driverEmployeeId");

-- CreateIndex
CREATE INDEX "AttendanceEntry_companyId_workDate_idx" ON "AttendanceEntry"("companyId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceEntry_companyId_employeeId_workDate_idx" ON "AttendanceEntry"("companyId", "employeeId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceEntry_companyId_workAssignmentId_idx" ON "AttendanceEntry"("companyId", "workAssignmentId");

-- CreateIndex
CREATE INDEX "AttendanceEntry_workflowStatus_idx" ON "AttendanceEntry"("workflowStatus");

-- CreateIndex
CREATE INDEX "GeofenceZone_companyId_isActive_idx" ON "GeofenceZone"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GeofenceZone_companyId_id_key" ON "GeofenceZone"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GeofenceZone_companyId_name_key" ON "GeofenceZone"("companyId", "name");

-- CreateIndex
CREATE INDEX "GeofenceAttendanceEvent_companyId_occurredAt_idx" ON "GeofenceAttendanceEvent"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "GeofenceAttendanceEvent_companyId_zoneId_occurredAt_idx" ON "GeofenceAttendanceEvent"("companyId", "zoneId", "occurredAt");

-- CreateIndex
CREATE INDEX "GeofenceAttendanceEvent_companyId_employeeId_occurredAt_idx" ON "GeofenceAttendanceEvent"("companyId", "employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "GeofenceAttendanceEvent_companyId_workDate_idx" ON "GeofenceAttendanceEvent"("companyId", "workDate");

-- CreateIndex
CREATE INDEX "EmployeeMobileAccessToken_companyId_employeeId_idx" ON "EmployeeMobileAccessToken"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeMobileAccessToken_userId_revokedAt_idx" ON "EmployeeMobileAccessToken"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeMobileAccessToken_companyId_tokenPrefix_key" ON "EmployeeMobileAccessToken"("companyId", "tokenPrefix");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeCompanyId_fkey" FOREIGN KEY ("activeCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_linkedEmployeeId_fkey" FOREIGN KEY ("linkedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetLink" ADD CONSTRAINT "MediaAssetLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyAccess" ADD CONSTRAINT "UserCompanyAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyAccess" ADD CONSTRAINT "UserCompanyAccess_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyAccess" ADD CONSTRAINT "UserCompanyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "Category"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUom" ADD CONSTRAINT "MaterialUom_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUom" ADD CONSTRAINT "MaterialUom_companyId_materialId_fkey" FOREIGN KEY ("companyId", "materialId") REFERENCES "Material"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUom" ADD CONSTRAINT "MaterialUom_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUom" ADD CONSTRAINT "MaterialUom_parentUomId_fkey" FOREIGN KEY ("parentUomId") REFERENCES "MaterialUom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_companyId_materialId_fkey" FOREIGN KEY ("companyId", "materialId") REFERENCES "Material"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companyId_materialId_fkey" FOREIGN KEY ("companyId", "materialId") REFERENCES "Material"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companyId_parentTransactionId_fkey" FOREIGN KEY ("companyId", "parentTransactionId") REFERENCES "Transaction"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionBatch" ADD CONSTRAINT "TransactionBatch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionBatch" ADD CONSTRAINT "TransactionBatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_parentJobId_fkey" FOREIGN KEY ("companyId", "parentJobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContact" ADD CONSTRAINT "JobContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContact" ADD CONSTRAINT "JobContact_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceExpertise" ADD CONSTRAINT "WorkforceExpertise_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequiredExpertise" ADD CONSTRAINT "JobRequiredExpertise_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequiredExpertise" ADD CONSTRAINT "JobRequiredExpertise_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequiredExpertise" ADD CONSTRAINT "JobRequiredExpertise_companyId_expertiseId_fkey" FOREIGN KEY ("companyId", "expertiseId") REFERENCES "WorkforceExpertise"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLpoValueHistory" ADD CONSTRAINT "JobLpoValueHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLpoValueHistory" ADD CONSTRAINT "JobLpoValueHistory_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSyncLog" ADD CONSTRAINT "IntegrationSyncLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaLibrary" ADD CONSTRAINT "FormulaLibrary_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_companyId_formulaLibraryId_fkey" FOREIGN KEY ("companyId", "formulaLibraryId") REFERENCES "FormulaLibrary"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemAssignment" ADD CONSTRAINT "JobItemAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemAssignment" ADD CONSTRAINT "JobItemAssignment_companyId_jobItemId_fkey" FOREIGN KEY ("companyId", "jobItemId") REFERENCES "JobItem"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemAssignment" ADD CONSTRAINT "JobItemAssignment_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaPeriod" ADD CONSTRAINT "VisaPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaPeriod" ADD CONSTRAINT "VisaPeriod_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocumentType" ADD CONSTRAINT "EmployeeDocumentType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_companyId_visaPeriodId_fkey" FOREIGN KEY ("companyId", "visaPeriodId") REFERENCES "VisaPeriod"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_companyId_documentTypeId_fkey" FOREIGN KEY ("companyId", "documentTypeId") REFERENCES "EmployeeDocumentType"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignment" ADD CONSTRAINT "WorkAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignment" ADD CONSTRAINT "WorkAssignment_companyId_workScheduleId_fkey" FOREIGN KEY ("companyId", "workScheduleId") REFERENCES "WorkSchedule"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignment" ADD CONSTRAINT "WorkAssignment_companyId_jobId_fkey" FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignment" ADD CONSTRAINT "WorkAssignment_companyId_teamLeaderEmployeeId_fkey" FOREIGN KEY ("companyId", "teamLeaderEmployeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignment" ADD CONSTRAINT "WorkAssignment_companyId_driver1EmployeeId_fkey" FOREIGN KEY ("companyId", "driver1EmployeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignment" ADD CONSTRAINT "WorkAssignment_companyId_driver2EmployeeId_fkey" FOREIGN KEY ("companyId", "driver2EmployeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignmentMember" ADD CONSTRAINT "WorkAssignmentMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignmentMember" ADD CONSTRAINT "WorkAssignmentMember_companyId_workAssignmentId_fkey" FOREIGN KEY ("companyId", "workAssignmentId") REFERENCES "WorkAssignment"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAssignmentMember" ADD CONSTRAINT "WorkAssignmentMember_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAbsence" ADD CONSTRAINT "ScheduleAbsence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAbsence" ADD CONSTRAINT "ScheduleAbsence_companyId_workScheduleId_fkey" FOREIGN KEY ("companyId", "workScheduleId") REFERENCES "WorkSchedule"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAbsence" ADD CONSTRAINT "ScheduleAbsence_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverRunLog" ADD CONSTRAINT "DriverRunLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverRunLog" ADD CONSTRAINT "DriverRunLog_companyId_workScheduleId_fkey" FOREIGN KEY ("companyId", "workScheduleId") REFERENCES "WorkSchedule"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverRunLog" ADD CONSTRAINT "DriverRunLog_companyId_driverEmployeeId_fkey" FOREIGN KEY ("companyId", "driverEmployeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_companyId_workAssignmentId_fkey" FOREIGN KEY ("companyId", "workAssignmentId") REFERENCES "WorkAssignment"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeofenceZone" ADD CONSTRAINT "GeofenceZone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeofenceAttendanceEvent" ADD CONSTRAINT "GeofenceAttendanceEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeofenceAttendanceEvent" ADD CONSTRAINT "GeofenceAttendanceEvent_companyId_zoneId_fkey" FOREIGN KEY ("companyId", "zoneId") REFERENCES "GeofenceZone"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeofenceAttendanceEvent" ADD CONSTRAINT "GeofenceAttendanceEvent_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMobileAccessToken" ADD CONSTRAINT "EmployeeMobileAccessToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMobileAccessToken" ADD CONSTRAINT "EmployeeMobileAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMobileAccessToken" ADD CONSTRAINT "EmployeeMobileAccessToken_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
