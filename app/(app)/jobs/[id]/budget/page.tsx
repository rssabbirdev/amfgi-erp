import { redirect } from 'next/navigation';

export default async function JobBudgetAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/stock/job-budget/${id}`);
}
