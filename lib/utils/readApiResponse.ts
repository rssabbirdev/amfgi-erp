export type ApiJsonBody<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
};

export async function readApiJson<T = unknown>(res: Response): Promise<ApiJsonBody<T> | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as ApiJsonBody<T>;
  } catch {
    return null;
  }
}
