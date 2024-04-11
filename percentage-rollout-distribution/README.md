# LaunchDarkly Sample Node.js Application for Percentage Rollout Validation

This project builds on the LaunchDarkly hello node project, now adapted to validate the distribution of percentage rollouts as configured. It provides a practical example of how to ensure the accuracy of feature flags in terms of their intended distribution percentages using the LaunchDarkly SDK in a server-side Node.js environment.

For comprehensive instructions and more information, you can visit the [Quickstart page](https://app.launchdarkly.com/quickstart#/) or the [Node.js (server-side) reference guide](https://docs.launchdarkly.com/sdk/server-side/node-js).

The LaunchDarkly server-side SDK is best suited for multi-user systems like web servers and applications, adhering to the server-side model. It's not designed for desktop and embedded systems.

## Configuration Options
Below are the required and optional configuration options available in index.js. Experiment with these settings, particularly the numberOfUsersToEvaluate, to see how they affect the distribution outcomes.

### Required Configuration
**SDK Key**:

```js
const sdkKey = "1234567890abcdef";
```

**Feature Flag Key (for percentage rollouts)**:

```js
const flagKey = "my_flag";
```

### Optional Configuration
**Base Context**: Set if your percentage rollout requires specific attributes.

```js
const baseContext = null;
```

**Percentage Rollout Context Kind**: Adjust if you've changed the attribute that percentage rollouts are based on.

```js
const percentageRolloutContextKind = "user";
const percentageRolloutAttribute = "key";
```

**Number of Contexts to Evaluate**: Modify to increase or decrease the number of users evaluated.

```js
const numberOfContextsToEvaluate = 100000;
```

**Identity Prefix**: Change this value to run tests with a new segment of users.

```js
const identityPrefix = Date.now(); // Ensures each script invocation generates a new random segment.
```

## Build Instructions
Install the LaunchDarkly Node.js SDK:

```bash
npm install
```

Configure your application by editing the provided variables in index.js.

Execute the application to test and validate the distribution accuracy of your feature flag:

```bash
node index.js
```

The output will reflect the distribution results for the configured percentage rollout feature flag across the specified number of users. Here are the expected outputs documented based on the script operations:

1. **Number of Contexts to Evaluate**: The script outputs the total number of user contexts evaluated, which is determined by the numberOfContextsToEvaluate variable. This reflects how many users have been tested against the feature flag to assess the distribution.

2. **Results**: This output displays the count of how many users received each possible outcome (e.g., true or false if it's a boolean flag) of the feature flag. This helps in understanding the actual distribution of the flag's outcomes across all evaluated users.

3. **Reasons**: The script records why each flag evaluation resulted in its particular outcome, categorized by reason.kind from the SDK's detailed evaluation. This could include reasons like TARGET_MATCH, FALLTHROUGH, or ERROR.

4. **Errors**: If any errors occurred during the flag evaluation (e.g., if the flag key didn't exist), these are counted and reported under specific error kinds, such as FLAG_NOT_FOUND or MALFORMED_FLAG.

5. **Distribution**: The script calculates the percentage of users that received each outcome and presents this as a percentage distribution. For example, if a flag is intended to be true for 30% of users, this output helps verify whether the actual distribution aligns with the expected setup.

6. **Maximum Difference**: This is the maximum difference in distribution percentages between any two outcomes. It is calculated to gauge the evenness of the distribution. For instance, if one outcome is much more common than others, this value will highlight the disparity.

Each of these outputs is crucial for understanding how effectively and accurately the feature flag is being rolled out to users, especially when testing configurations that should lead to specific distribution patterns across a large sample size. The script effectively helps in validating that the percentage rollouts are distributed as configured by providing a detailed breakdown of outcomes, reasons for those outcomes, and any discrepancies in the expected distribution.