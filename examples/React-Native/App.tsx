import { useEffect, useState } from 'react';
import { MOBILE_KEY } from '@env';
import {
  AutoEnvAttributes,
  LDProvider,
  ReactNativeLDClient,
  LDOptions,
} from '@launchdarkly/react-native-client-sdk';
import { Observability } from '@launchdarkly/observability-react-native';
import SignupFunnel from './src/SignupFunnel';

// In an Expo app, read the real build version from `expo-application` /
// `expo-updates` and pass it as `serviceVersion`. We use a static value here.
// https://launchdarkly.com/docs/sdk/observability/react-native#report-version-information-in-expo-apps
const SERVICE_VERSION = '1.0.0';

const options: LDOptions = {
  // Optional: application metadata for engineering insights.
  // https://launchdarkly.com/docs/home/releases/applications
  applicationInfo: {
    id: 'Hello-React-Native-Expo',
    name: 'Sample Application',
    version: SERVICE_VERSION,
    versionName: 'v1',
  },
  debug: true,
  plugins: [
    // LaunchDarkly Observability plugin. A few common options are shown; all are
    // optional and the plugin works with a bare `new Observability()`. For the
    // full list of options, see:
    //   https://launchdarkly.com/docs/sdk/observability/react-native
    //   https://launchdarkly.com/docs/sdk/features/observability-config-client-side#react-native
    new Observability({
      // Identifies this app in traces, logs, and metrics.
      serviceName: 'hello-react-native-expo',
      // Recommended: set to the latest deployed git SHA or app version.
      serviceVersion: SERVICE_VERSION,

      // Extra resource attributes attached to all telemetry.
      resourceAttributes: {
        'app.tier': 'sample',
        'deploy.environment': 'development',
      },

      // Give contexts a friendly display name in the LaunchDarkly UI.
      contextFriendlyName: (context) =>
        'key' in context ? String(context.key) : undefined,

      // Endpoint overrides — only needed if you proxy telemetry through your own
      // domain (see the "Using a proxy" docs). Defaults shown for reference.
      // backendUrl: 'https://pub.observability.app.launchdarkly.com',
      // otlpEndpoint: 'https://otel.observability.app.launchdarkly.com:4318',
    }),
  ],
};

const userContext = { kind: 'user', key: 'test-hello' };

export default function App() {
  const [client, setClient] = useState<ReactNativeLDClient | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Initialize client
    const featureClient = new ReactNativeLDClient(
      MOBILE_KEY,
      AutoEnvAttributes.Enabled,
      options,
    );

    // Render once identify() settles. On success, flags evaluate against the
    // intended context (and record exposures correctly) rather than returning
    // per-call defaults during startup. On failure we still render, so the demo
    // isn't stuck on a blank screen when LaunchDarkly is unreachable or the
    // mobile key is misconfigured — flags fall back to their per-call defaults.
    // The `cancelled` guard avoids a state update if the component unmounts
    // before identify() settles.
    featureClient
      .identify(userContext)
      .catch((e: any) => console.error(e))
      .finally(() => {
        if (!cancelled) {
          setClient(featureClient);
        }
      });

    // Cleanup function that runs when component unmounts
    return () => {
      cancelled = true;
      featureClient.close();
    };
  }, []);

  if (!client) {
    return null;
  }

  return (
    <LDProvider client={client}>
      <SignupFunnel />
    </LDProvider>
  );
}
