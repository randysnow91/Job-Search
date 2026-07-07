import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProfileForm from '../ProfileForm';

export default async function NewProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <Link href="/profiles" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Back to profiles
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Create profile</h1>
      </div>
      <ProfileForm userId={user.id} />
    </div>
  );
}
