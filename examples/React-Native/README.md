# LaunchDarkly sample React Native application

This sample app demonstrates three LaunchDarkly capabilities in one React Native (Expo) app:

- **Feature flags & experimentation** — a multi-step sign-up "funnel" whose UI is controlled by a flag, so it can be run as an A/B experiment.
- **Observability** — the LaunchDarkly Observability plugin, initialized in [`App.tsx`](./App.tsx) with every supported option shown and documented.
- **Metrics / event tracking** — each funnel step sends a custom event with `ldClient.track()`, which powers both the experiment's funnel metric group and the Observability product-analytics funnels.

For more comprehensive instructions, visit your [Quickstart page](https://app.launchdarkly.com/quickstart#/) or the [React Native reference guide](https://launchdarkly.com/docs/sdk/client-side/react/react-native).

This demo requires Node 20 or higher LTS, Android Studio with an emulated device running API 34, and Watchman (for Linux or macOS users).

## Build instructions

1. Create an `.env` file and set `MOBILE_KEY` to your LaunchDarkly environment's mobile key:

   ```
   MOBILE_KEY=your-mobile-key
   ```

2. On the command line, run `yarn && yarn ios` for iOS builds or `yarn && yarn android` for Android builds.

> **Observability requires a development build, not Expo Go.** The Observability plugin relies on native modules that do not run in Expo Go. Use an [Expo development build](https://docs.expo.dev/develop/development-builds/introduction/) or a standalone build. Feature flags and experimentation event tracking work in Expo Go; only the native observability data collection requires a dev build.

To start fresh, run `yarn clean-reset`. To reset Watchman, run `yarn watchman-reset`.

## What the app does

The app renders a three-step sign-up funnel:

1. **Sign up** button → sends the `signup-button-clicked` event.
2. **Choose a plan** and continue → sends the `signup-info-entered` event.
3. **Complete sign-up** → sends the `signup-completed` event, then flushes events.

The `signup-flow-variation` flag decides how the "choose a plan" step is rendered (`control`, `dropdown`, or `radio`), which is the change under experiment.

---

## LaunchDarkly UI setup (required to see results)

Complete the steps below in the LaunchDarkly UI so the app's flag, events, and experiment produce results. This mirrors the [funnel optimization guide](https://launchdarkly.com/docs/guides/experimentation/funnel-optimization) and the [React Native experimentation docs](https://launchdarkly.com/docs/sdk/features/experimentation#react-native).

### 1. Create the flag

Create a flag that selects the sign-up UI variation:

- **Create → Flag** (optionally choose **Custom → Experiment**, which makes the flag a **String** type).
- **Key:** `signup-flow-variation` (must match the code).
- Add **three string variations**, using these exact **values** (the code compares against them):

  | Variation name | Value |
  | --- | --- |
  | Control | `control` |
  | Dropdown select | `dropdown` |
  | Radio select | `radio` |

- Set the **default (off) variation** to `control`.

### 2. Create the three funnel metrics

Under **Data → Metrics**, click **Create metric** for each step. For all three, use event kind **Custom**, keep the data warehouse on **LaunchDarkly hosted**, and in the metric definition choose **Count distinct units (Percent)** of **user** units that sent the event, where **higher is better**.

| Metric name | Event key (Custom) |
| --- | --- |
| Sign-up button clicked | `signup-button-clicked` |
| Sign-up info entered | `signup-info-entered` |
| Sign-up completed | `signup-completed` |

> The event keys must match the constants in [`src/SignupFunnel.tsx`](./src/SignupFunnel.tsx) exactly.

### 3. Create the funnel metric group

Under **Data → Metrics → Metric groups**, click **Create metric group**:

- **Type:** Funnel
- **Name:** `New plan sign-up flow`
- Add the metrics as steps **in this order** (order matters — it must match the user's journey):
  1. Sign-up button clicked
  2. Sign-up info entered
  3. Sign-up completed

### 4. Build the experiment

- **Create → Experiment.**
- Enter a **Name** and a **Hypothesis** (e.g. "A clearer plan-selection UI increases completed sign-ups").
- **Randomize by:** user.
- **Metric source:** LaunchDarkly. **Metrics:** select the `New plan sign-up flow` metric group.
- **Flag:** `signup-flow-variation`, on the **Default rule**.
- **Variation served to users outside the experiment:** Control.
- Choose a **Sample size** and a **Statistical approach** (Bayesian or frequentist), then **Save**.

### 5. Start an iteration

Open the experiment's **Design** tab and click **Start**. Results appear on the **Results** tab once enough contexts have gone through the funnel.

> **Seeing results requires many distinct contexts.** This sample identifies a single static user (`{ kind: 'user', key: 'test-hello' }` in `App.tsx`). An experiment needs many unique contexts to accumulate exposures and conversions — in a real app, use a unique `key` per user. To generate sample traffic, change the context key and re-run the funnel, or drive the flow from multiple devices/users.

### 6. Review observability data

After the app runs on a development build, it automatically sends observability data (errors, logs, traces, and product-analytics events) to LaunchDarkly. View it under **Observability**. Because each funnel step calls `ldClient.track()`, those events also appear as `track` product-analytics events you can chart as time series and funnels. To learn more, read [Observability](https://launchdarkly.com/docs/home/observability) and [Product analytics events](https://launchdarkly.com/docs/home/observability/product-analytics).
