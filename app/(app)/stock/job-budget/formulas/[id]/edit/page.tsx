import { FormulaBuilderEditor } from '@/components/job-costing/FormulaBuilderEditor';

export default async function EditStockFormulaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormulaBuilderEditor formulaId={id} />;
}
