import { redirect } from 'next/navigation';

export default function NonStockReconcilePage() {
  redirect('/stock/issue-reconcile/new');
}
