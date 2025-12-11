'use client';

import { useFlags } from 'launchdarkly-react-client-sdk';

export default function Page() {
  const flags = useFlags();
  //TODO Set my-boolean-flag to a valid boolean flag key in your project/environment.
  const value = flags['bool-flag'] ?? false;

  return (
    <main className="container">
      <h1>Welcome to LaunchDarkly</h1>
      <h1>Flag value is {String(value)}</h1>
    </main>
  );
}
