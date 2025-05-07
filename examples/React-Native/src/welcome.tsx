import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBoolVariation } from '@launchdarkly/react-native-client-sdk';

//TODO Set my-boolean-flag to a valid boolean flag key in your project/environment.
const FLAG_KEY = 'my-boolean-flag';

export default function Welcome() {
  const flagValue = useBoolVariation(FLAG_KEY, false);

  return (
    <View style={styles.container}>
      <Text>Welcome to LaunchDarkly</Text>
      <Text>Flag value is {`${flagValue}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
