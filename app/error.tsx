"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page"><div><h1>We couldn’t load your portfolio.</h1><p>Your data is safe. Please try again in a moment.</p><button onClick={reset}>Try again</button></div></main>;
}
