import { redirect } from 'next/navigation';

export default async function LegacyJobFormPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  redirect(`/customers/jobs/form${query.size > 0 ? `?${query.toString()}` : ''}`);
}
