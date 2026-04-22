import { redirect } from 'next/navigation';

export default async function MaterialDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/stock/materials/${id}`);
}
