import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DEV_USER_ID } from '@/lib/dev';
import ProfileForm from '../../ProfileForm';

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: profile } = await supabase
    .from('search_profiles')
    .select('*')
    .eq('id', id)
    .eq('user_id', DEV_USER_ID)
    .single();

  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <Link href="/profiles" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Back to profiles
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Edit profile</h1>
      </div>
      <ProfileForm profile={profile} />
    </div>
  );
}
