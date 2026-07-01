import type { PrismaClient } from '@prisma/client';
import { GLOBAL_LIVE_UPDATE_COMPANY_ID } from '@/lib/live-updates/server';

export type CompanyDeleteLinkCategory =
  | 'customers'
  | 'suppliers'
  | 'jobs'
  | 'materials'
  | 'employees'
  | 'transactions'
  | 'dispatch'
  | 'delivery'
  | 'stockBatches'
  | 'stockCounts'
  | 'categories'
  | 'units'
  | 'warehouses'
  | 'users'
  | 'userAccess'
  | 'media'
  | 'payroll'
  | 'scheduling'
  | 'documents'
  | 'integrations'
  | 'masterData';

export interface CompanyDeleteLinkSummary {
  category: CompanyDeleteLinkCategory;
  label: string;
  count: number;
}

export interface CompanyDeleteCheckResult {
  canDelete: boolean;
  companyId: string;
  companyName: string;
  deleteBlockedReason?: 'system_company' | 'linked_data';
  links: CompanyDeleteLinkSummary[];
  totalLinkedCount: number;
}

type PrismaLike = Pick<
  PrismaClient,
  | 'company'
  | 'customer'
  | 'supplier'
  | 'job'
  | 'material'
  | 'employee'
  | 'transaction'
  | 'dispatchEntryRevision'
  | 'deliveryNote'
  | 'stockBatch'
  | 'stockCountSession'
  | 'category'
  | 'unit'
  | 'warehouse'
  | 'user'
  | 'userCompanyAccess'
  | 'mediaAsset'
  | 'payRun'
  | 'workAssignment'
  | 'workSchedule'
  | 'employeeDocument'
  | 'integrationSyncLog'
  | 'formulaLibrary'
  | 'companyHoliday'
  | 'workforceExpertise'
  | 'quantityLogDaySubmission'
  | 'quantityLogAdhocJob'
  | 'apiCredential'
  | 'productionStockPosting'
>;

function pushLink(
  links: CompanyDeleteLinkSummary[],
  category: CompanyDeleteLinkCategory,
  label: string,
  count: number,
) {
  if (count > 0) links.push({ category, label, count });
}

export function formatCompanyDeleteBlockMessage(result: CompanyDeleteCheckResult): string {
  if (result.deleteBlockedReason === 'system_company') {
    return 'This company cannot be deleted.';
  }
  if (result.links.length === 0) {
    return 'This company cannot be deleted because it has linked data.';
  }
  const parts = result.links.map((link) => {
    const noun = link.count === 1 ? link.label.toLowerCase() : `${link.label.toLowerCase()}s`;
    return `${link.count} ${noun}`;
  });
  return `Cannot delete company: linked data exists (${parts.join(', ')}).`;
}

export async function checkCompanyDeleteEligibility(
  prisma: PrismaLike,
  companyId: string,
): Promise<CompanyDeleteCheckResult> {
  if (companyId === GLOBAL_LIVE_UPDATE_COMPANY_ID) {
    return {
      canDelete: false,
      companyId,
      companyName: '__system_live_updates',
      deleteBlockedReason: 'system_company',
      links: [],
      totalLinkedCount: 0,
    };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  const [
    customerCount,
    supplierCount,
    jobCount,
    materialCount,
    employeeCount,
    transactionCount,
    dispatchCount,
    deliveryCount,
    stockBatchCount,
    stockCountSessionCount,
    categoryCount,
    unitCount,
    userWarehouseCount,
    activeCompanyUserCount,
    userAccessCount,
    mediaCount,
    payRunCount,
    workAssignmentCount,
    workScheduleCount,
    employeeDocumentCount,
    integrationLogCount,
    formulaLibraryCount,
    companyHolidayCount,
    workforceExpertiseCount,
    quantityLogSubmissionCount,
    quantityLogAdhocJobCount,
    apiCredentialCount,
    productionPostingCount,
  ] = await Promise.all([
    prisma.customer.count({ where: { companyId } }),
    prisma.supplier.count({ where: { companyId } }),
    prisma.job.count({ where: { companyId } }),
    prisma.material.count({ where: { companyId } }),
    prisma.employee.count({ where: { companyId } }),
    prisma.transaction.count({ where: { companyId } }),
    prisma.dispatchEntryRevision.count({ where: { companyId } }),
    prisma.deliveryNote.count({ where: { companyId } }),
    prisma.stockBatch.count({ where: { companyId } }),
    prisma.stockCountSession.count({ where: { companyId } }),
    prisma.category.count({ where: { companyId } }),
    prisma.unit.count({ where: { companyId } }),
    prisma.warehouse.count({ where: { companyId, isSystem: false } }),
    prisma.user.count({ where: { activeCompanyId: companyId } }),
    prisma.userCompanyAccess.count({ where: { companyId } }),
    prisma.mediaAsset.count({ where: { companyId } }),
    prisma.payRun.count({ where: { companyId } }),
    prisma.workAssignment.count({ where: { companyId } }),
    prisma.workSchedule.count({ where: { companyId } }),
    prisma.employeeDocument.count({ where: { companyId } }),
    prisma.integrationSyncLog.count({ where: { companyId } }),
    prisma.formulaLibrary.count({ where: { companyId } }),
    prisma.companyHoliday.count({ where: { companyId } }),
    prisma.workforceExpertise.count({ where: { companyId } }),
    prisma.quantityLogDaySubmission.count({ where: { companyId } }),
    prisma.quantityLogAdhocJob.count({ where: { companyId } }),
    prisma.apiCredential.count({ where: { companyId } }),
    prisma.productionStockPosting.count({ where: { companyId } }),
  ]);

  const links: CompanyDeleteLinkSummary[] = [];
  pushLink(links, 'customers', 'Customer', customerCount);
  pushLink(links, 'suppliers', 'Supplier', supplierCount);
  pushLink(links, 'jobs', 'Job', jobCount);
  pushLink(links, 'materials', 'Material', materialCount);
  pushLink(links, 'employees', 'Employee', employeeCount);
  pushLink(links, 'transactions', 'Stock transaction', transactionCount);
  pushLink(links, 'dispatch', 'Dispatch entry', dispatchCount);
  pushLink(links, 'delivery', 'Delivery note', deliveryCount);
  pushLink(links, 'stockBatches', 'Stock batch', stockBatchCount);
  pushLink(links, 'stockCounts', 'Stock count session', stockCountSessionCount);
  pushLink(links, 'categories', 'Category', categoryCount);
  pushLink(links, 'units', 'Unit', unitCount);
  pushLink(links, 'warehouses', 'User warehouse', userWarehouseCount);
  pushLink(links, 'users', 'User with active company', activeCompanyUserCount);
  pushLink(links, 'userAccess', 'User access assignment', userAccessCount);
  pushLink(links, 'media', 'Media file', mediaCount);
  pushLink(links, 'payroll', 'Payroll run', payRunCount);
  pushLink(links, 'scheduling', 'Schedule assignment', workAssignmentCount + workScheduleCount);
  pushLink(links, 'documents', 'Employee document', employeeDocumentCount);
  pushLink(links, 'integrations', 'Integration sync log', integrationLogCount);
  pushLink(links, 'masterData', 'Formula library', formulaLibraryCount);
  pushLink(links, 'masterData', 'Company holiday', companyHolidayCount);
  pushLink(links, 'masterData', 'Workforce expertise', workforceExpertiseCount);
  pushLink(links, 'masterData', 'Quantity log submission', quantityLogSubmissionCount);
  pushLink(links, 'masterData', 'Quantity log ad-hoc job', quantityLogAdhocJobCount);
  pushLink(links, 'integrations', 'API credential', apiCredentialCount);
  pushLink(links, 'stockBatches', 'Production stock posting', productionPostingCount);

  const totalLinkedCount = links.reduce((sum, link) => sum + link.count, 0);

  return {
    canDelete: totalLinkedCount === 0,
    companyId: company.id,
    companyName: company.name,
    deleteBlockedReason: totalLinkedCount > 0 ? 'linked_data' : undefined,
    links,
    totalLinkedCount,
  };
}
