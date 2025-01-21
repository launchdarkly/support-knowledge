import { MOBILE_KEY } from '@env';
import {
  AutoEnvAttributes,
  LDProvider,
  ReactNativeLDClient,
  LDOptions,
} from '@launchdarkly/react-native-client-sdk';
import Welcome from './src/welcome';


const options: LDOptions = {
  applicationInfo: {
    id: 'Hello-React-Native-Expo',
    name: 'Sample Application',
    version: '1.0.0',
    versionName: 'v1',
  },
  debug: true,
}
//TODO Set MOBILE_KEY in .env file to a mobile key in your project/environment.
const featureClient = new ReactNativeLDClient(MOBILE_KEY, AutoEnvAttributes.Enabled, options);
const userContext = { kind: 'user', key: 'test-hello' };

export default function App() {
  featureClient.identify(userContext).catch((e: any) => console.log(e));

  return (
    <LDProvider client={featureClient}>
      <Welcome />
    </LDProvider>
  );
}