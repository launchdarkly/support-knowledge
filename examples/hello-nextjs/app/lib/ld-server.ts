import * as ld from '@launchdarkly/node-server-sdk';

let client: ld.LDClient | null = null;

export function getLDClient(): ld.LDClient {
  if (!client) {
    const sdkKey = process.env.LD_SDK_KEY;
    if (!sdkKey || sdkKey === 'YOUR_SERVER_SDK_KEY') {
      console.warn('[LaunchDarkly] LD_SDK_KEY not configured');
    }

    client = ld.init(sdkKey || 'invalid-key');

    client.waitForInitialization({ timeout: 5 }).catch((e) => {
      console.warn('[LaunchDarkly] Init failed:', e instanceof Error ? e.message : e);
    });

    const shutdown = () => client?.flush().finally(() => client?.close());
    process.on('beforeExit', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  return client;
}

