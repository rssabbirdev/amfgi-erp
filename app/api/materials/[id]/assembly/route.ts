import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { recalculateAssemblyUnitCostTx } from '@/lib/utils/materialAssembly';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const UpdateAssemblySchema = z.object({
  outputQuantity: z.number().finite().positive(),
  overheadPercent: z.number().finite().min(0),
  components: z.array(
    z.object({
      componentMaterialId: z.string().min(1),
      quantity: z.number().finite().positive(),
    })
  ),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const companyId = session.user.activeCompanyId;

  const material = await prisma.material.findUnique({
    where: { id },
    select: { id: true, companyId: true, stockType: true, assemblyOutputQuantity: true, assemblyOverheadPercent: true },
  });
  if (!material || material.companyId !== companyId) return errorResponse('Material not found', 404);
  if (material.stockType !== 'Stock Assembly') return successResponse({ outputQuantity: Number(material.assemblyOutputQuantity), overheadPercent: Number(material.assemblyOverheadPercent ?? 0), components: [] });

  const components = await prisma.materialAssemblyComponent.findMany({
    where: { companyId, assemblyMaterialId: id },
    include: {
      componentMaterial: {
        select: { id: true, name: true, unit: true, unitCost: true, isActive: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return successResponse({
    outputQuantity: Number(material.assemblyOutputQuantity),
    overheadPercent: Number(material.assemblyOverheadPercent ?? 0),
    components: components.map((row) => ({
      id: row.id,
      componentMaterialId: row.componentMaterialId,
      quantity: Number(row.quantity),
      componentMaterial: {
        id: row.componentMaterial.id,
        name: row.componentMaterial.name,
        unit: row.componentMaterial.unit,
        unitCost: Number(row.componentMaterial.unitCost ?? 0),
        isActive: row.componentMaterial.isActive,
      },
      lineCost: Number(row.quantity) * Number(row.componentMaterial.unitCost ?? 0),
    })),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.edit')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateAssemblySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const companyId = session.user.activeCompanyId;
  const changedBy = session.user.name || session.user.email || session.user.id;
  const deduped = new Map<string, number>();
  for (const row of parsed.data.components) {
    if (row.componentMaterialId === id) return errorResponse('Assembly cannot include itself as a component', 422);
    deduped.set(row.componentMaterialId, (deduped.get(row.componentMaterialId) ?? 0) + row.quantity);
  }
  const components = Array.from(deduped.entries()).map(([componentMaterialId, quantity]) => ({
    componentMaterialId,
    quantity,
  }));

  try {
    await prisma.$transaction(async (tx) => {
      const assembly = await tx.material.findUnique({
        where: { id },
        select: { id: true, companyId: true, stockType: true },
      });
      if (!assembly || assembly.companyId !== companyId) {
        throw new Error('Material not found');
      }
      if (assembly.stockType !== 'Stock Assembly') {
        throw new Error('Only Stock Assembly materials can have components');
      }

      if (components.length > 0) {
        const componentMaterials = await tx.material.findMany({
          where: {
            companyId,
            id: { in: components.map((entry) => entry.componentMaterialId) },
            isActive: true,
          },
          select: { id: true },
        });
        if (componentMaterials.length !== components.length) {
          throw new Error('One or more component materials are missing or inactive');
        }
      }

      await tx.material.update({
        where: { id },
        data: {
          assemblyOutputQuantity: parsed.data.outputQuantity,
          assemblyOverheadPercent: parsed.data.overheadPercent,
        },
      });

      const existing = await tx.materialAssemblyComponent.findMany({
        where: { companyId, assemblyMaterialId: id },
        select: { id: true, componentMaterialId: true },
      });
      const nextIds = new Set(components.map((entry) => entry.componentMaterialId));
      const toDelete = existing.filter((row) => !nextIds.has(row.componentMaterialId)).map((row) => row.id);
      if (toDelete.length > 0) {
        await tx.materialAssemblyComponent.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const row of components) {
        await tx.materialAssemblyComponent.upsert({
          where: {
            assemblyMaterialId_componentMaterialId: {
              assemblyMaterialId: id,
              componentMaterialId: row.componentMaterialId,
            },
          },
          create: {
            companyId,
            assemblyMaterialId: id,
            componentMaterialId: row.componentMaterialId,
            quantity: row.quantity,
          },
          update: {
            quantity: row.quantity,
          },
        });
      }

      await recalculateAssemblyUnitCostTx(tx, companyId, id, changedBy);
    });
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to save assembly components', 400);
  }

  return successResponse({ saved: true });
}
