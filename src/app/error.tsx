"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>We couldn’t load this page</h1>
      <p>Your saved records remain available. Try loading the page again.</p>
      <button onClick={reset}>Try again</button>
      <a href="/home">Return home</a>
    </main>
  );
}
