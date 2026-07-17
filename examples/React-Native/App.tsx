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
    version: '1.0.0',
    versionName: 'v1',
  },
  debug: true,
  plugins: [
    // LaunchDarkly Observability plugin. Every supported React Native option is
    // shown below with an explanatory comment. All of them are optional — the
    // plugin works with a bare `new Observability()`. Docs:
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

      // Attach a W3C `traceparent` header to requests whose URL matches, so
      // mobile traces link to your backend's traces. Use `true` to match your
      // own domain, or a list of substrings / regexes.
      tracingOrigins: ['api.example.com', /\.internal\.example\.com$/],

      // Never record headers/bodies or propagate trace headers to these URLs.
      urlBlocklist: ['https://secure.example.com/token'],

      // How long (ms) a reload or relaunch continues the same session.
      // Default is 15 minutes.
      sessionTimeout: 15 * 60 * 1000,

      // Network request capture. `recordHeadersAndBody` defaults to false.
      networkRecording: {
        recordHeadersAndBody: false,
        // networkHeadersToRedact: ['Authorization'],
        // networkBodyKeysToRedact: ['password'],
      },

      // Feature toggles — keep false to collect everything.
      disableErrorTracking: false,
      disableLogs: false,
      disableTraces: false,
      disableMetrics: false,

      // Plugin-level debug logging (separate from the SDK-level `debug` above).
      debug: true,

      // Custom headers added to OTLP exports.
      customHeaders: {},

      // The Observability plugin emits flag-exposure telemetry for every
      // evaluation by default. In a high-traffic app you can de-duplicate
      // repeated exposures (same flag+context+value) within a window to reduce
      // telemetry volume. Left at the default (disabled) here. This tunes
      // observability data only — it does NOT affect experiment exposure
      // attribution, which the LaunchDarkly SDK handles separately.
      // flagExposureDedupeWindowMillis: 60_000,
      // flagExposureDedupeMaxSize: 2000,

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
    // Initialize client
    const featureClient = new ReactNativeLDClient(
      MOBILE_KEY,
      AutoEnvAttributes.Enabled,
      options,
    );

    featureClient.identify(userContext).catch((e: any) => console.log(e));

    setClient(featureClient);

    // Cleanup function that runs when component unmounts
    return () => {
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
