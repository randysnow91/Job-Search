import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProfileForm from '../../ProfileForm';

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('search_profiles')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">Edit profile</h1>
        <Link href="/profiles" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Profiles
        </Link>
      </div>
      <ProfileForm profile={profile} userId={user.id} />
    </div>
  );
}
