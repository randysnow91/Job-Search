import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Welcome to the Job Search Tool</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Built by James Snow (Randy) as a product-management portfolio project.{' '}
          <a
            href="https://github.com/randysnow91/Job-Search"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-600"
          >
            View on GitHub
          </a>
          .
        </p>
      </div>

      <div className="mb-8">
        <Link
          href="/profiles"
          className="rounded bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          My Profiles
        </Link>
      </div>

      <div className="space-y-4 text-zinc-700 leading-relaxed">
        <p>
          <strong>Search Profiles</strong> lets you add and edit the profiles you use in your
          job search. You can create one or more — for example, I have one for Retail and one
          for EdTech.
        </p>
        <p>
          <strong>All Reports</strong>{' '}is where you find the reports from previous searches. If
          you don&apos;t have time to review all the jobs a search found, you can always come
          back here to look at them again.
        </p>
        <p>
          <strong>Exclusions</strong>{' '}is where you manage the jobs you&apos;ve already applied
          for and the ones you dismissed because you weren&apos;t interested at the time. When
          you run a search, the app checks this list and skips jobs you&apos;ve already
          excluded. Changed your mind about a job you dismissed? No problem — you can restore
          it on the Exclusions page.
        </p>
        <p>
          <strong>New Profile</strong> is where you create a new profile.
        </p>
        <p>
          Please note: you&apos;ll need your own Anthropic API key to run a search. You can
          view or create keys at{' '}
          <a
            href="https://platform.claude.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-900"
          >
            platform.claude.com/settings/keys
          </a>
          .
        </p>
        <p>I hope you find the tool useful and that it helps you find your dream job.</p>
        <p>
          All the best,
          <br />
          Randy
        </p>
      </div>
    </div>
  );
}
