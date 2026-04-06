import { redirect } from 'next/navigation';

// Legacy route — replaced by /select-company
export default function SelectProfileRedirect() {
  redirect('/select-company');
}
