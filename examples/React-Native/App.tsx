import { useEffect, useState } from 'react';
import { MOBILE_KEY } from '@env';
import {
  AutoEnvAttributes,
  LDProvider,
  ReactNativeLDClient,
  LDOptions,
} from '@launchdarkly/react-native-client-sdk';
import Welcome from './src/welcome';

const options: LDOptions = {
  // Optional: Set Application Info
  // applicationInfo: {
  //   id: 'Hello-React-Native-Expo',
  //   name: 'Sample Application',
  //   version: '1.0.0',
  //   versionName: 'v1',
  // },
  debug: true,
}

const userContext = { kind: 'user', key: 'test-hello' };

export default function App() {
  const [client, setClient] = useState<ReactNativeLDClient | null>(null);
  
  useEffect(() => {
    // Initialize client
    const featureClient = new ReactNativeLDClient(MOBILE_KEY, AutoEnvAttributes.Enabled, options);
    
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
      <Welcome />
    </LDProvider>
  );
}
