# LaunchDarkly sample React Native application

We've built a simple mobile application that demonstrates how LaunchDarkly's SDK works.

Below, you'll find the build procedure. For more comprehensive instructions, you can visit your [Quickstart page](https://app.launchdarkly.com/quickstart#/) or the [React Native reference guide](https://docs.launchdarkly.com/sdk/client-side/react/react-native).

This demo requires Node 18 or higher LTS version, Android Studio with an emulated device running API 34 and Watchman (for Linux or macOS users).

## Build instructions

1. Create an `.env` file and set the value of `MOBILE_KEY` to your LaunchDarkly mobile key. If there is an existing boolean feature flag in your LaunchDarkly project that you want to evaluate, set my-boolean-flag to the flag key.

        const flagValue = useBoolVariation('my-boolean-flag', false);

2. On the command line, run `yarn && yarn ios` for iOS builds and `yarn && yarn android` for Android builds. 

Note for Android builds, there's an issue with Flipper interfering with streaming connections if you are using version 0.73 or eariler so please run the release build. This issue does not affect iOS builds.

You should receive the message ”Welcome to LaunchDarkly Flag value is <true/false>”.

To start fresh, run `yarn clean-reset`. To reset watchman, run `yarn watchman-reset`.