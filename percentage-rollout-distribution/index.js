// Update the below required and optional configuration options. Try playing around with the numberOfUsersToEvaluate.

// TODO : Enter your LaunchDarkly SDK key here
const sdkKey = "PUT_YOUR_SDK_KEY_HERE";

// TODO: Enter your percentage rollout flag key here
const flagKey = "PUT_YOUR_FLAG_KEY_HERE";

// OPTIONAL: If the rule associated with your percentage rollout requires specific attributes then set them here
const baseContext = null;
// OPTIONAL: Change this value if you've changed what attribute percentage rollouts are based on
const percentageRolloutContextKind = "user";
const percentageRolloutAttribute = "key";

// OPTIONAL: Change this value to change the number of users to evaluate
// Set this to a low value, and you should see even distributions less frequently.
// Set this to a high value, and you should see even distributions more commonly.
const numberOfContextsToEvaluate = 100000;

// OPTIONAL: Change this value if you'd like to run a new test with a new segment of users
// Keeping this the same will result in the same output every time.
// Change this to see how the distribution looks with a new segment of users
// Using `Date.now()` ensures every evocation of this scripts results in a new random generation.
const identityPrefix = Date.now();


///////////////////////////////////////////////////////////////////////////////
// Don't modify anything below here.
///////////////////////////////////////////////////////////////////////////////

const LaunchDarkly = require('@launchdarkly/node-server-sdk');
const ldclient = LaunchDarkly.init(sdkKey, { sendEvents: false });

ldclient.once('ready', async function () {
  const results = {};
  const reasons = {};
  const errors = {};
  for (n = 0; n < numberOfContextsToEvaluate; n++) {
    let hash = `${identityPrefix}${n}`;
    let context = buildContext(percentageRolloutContextKind, percentageRolloutAttribute, hash);
    const detail = await ldclient.variationDetail(flagKey, context, null);
    var value = detail.value;
    var reason = detail.reason;
    results[value] = results[value] || 0;
    results[value]++;
    reasons[reason.kind] = reasons[reason.kind] || 0;
    reasons[reason.kind]++;
    if (reason.kind === 'ERROR') {
      errors[reason.errorKind] = errors[reason.errorKind] || 0;
      errors[reason.errorKind]++;
    }
  }

  const distribution = {};
  for (const variationName in results) {
    distribution[variationName] = Math.round(results[variationName] / numberOfContextsToEvaluate * 10000) / 100
  }

  let maxDifference = 0;
  for (index1 in distribution) {
    for (index2 in distribution) {
      d1 = distribution[index1];
      d2 = distribution[index2];
      maxDifference = Math.round(Math.max(maxDifference, d1 - d2, d2 - d1) * 100) / 100;
    }
  }

  // make percentages more readible.
  maxDifference = `${maxDifference}%`;
  for (const variationName in results) {
    distribution[variationName] = `${distribution[variationName]}%`;
  }

  console.log({ numberOfContextsToEvaluate });
  console.log({ results });
  console.log({ reasons });
  console.log({ errors });
  console.log({ distribution });
  console.log({ maxDifference });

  ldclient.close();
});

function buildContext(contextKind, primaryAttribute, identifier) {
  let context = null;
  if (baseContext === null) {
    context = {};
    context['kind'] = contextKind;
    if (context['key'] === undefined) {
      context['key'] = 'anonymous';
    }
    context[primaryAttribute] = identifier;
  } else if (baseContext.kind === contextKind) {
    context = Object.apply({}, baseContext);
    if (context['key'] === undefined) {
      context['key'] = 'anonymous';
    }
    context[primaryAttribute] = identifier;
  } else {
    if (baseContext.kind === 'multi') {
      context = Object.apply({}, baseContext);
    } else {
      context = {}
      context['kind'] = 'multi';
      context[baseContext.kind] = Object.apply({}, baseContext);
      if (context[baseContext.kind]['key'] === undefined) {
        context[baseContext.kind]['key'] = 'anonymous';
      }
      context[baseContext.kind]['kind'] = undefined;
    }
    context[contextKind] = {};
    context[contextKind]['key'] = 'anonymous';
    if (context[contextKind]['key'] === undefined) {
      context[contextKind]['key'] = 'anonymous';
    }
    context[contextKind][primaryAttribute] = identifier;
  }
  return context;
}
