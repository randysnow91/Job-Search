import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Job Search Agent</h1>
      <p className="mt-4 text-lg text-zinc-600">Your AI-powered job search assistant.</p>
      <Link
        href="/profiles"
        className="mt-8 rounded bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Go to profiles →
      </Link>
    </main>
  );
}
