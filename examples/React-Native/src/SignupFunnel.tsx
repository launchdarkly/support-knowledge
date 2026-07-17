import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  useLDClient,
  useStringVariation,
} from '@launchdarkly/react-native-client-sdk';

// Sign-up funnel experiment, adapted for mobile from LaunchDarkly's
// "funnel optimization" guide:
//   https://launchdarkly.com/docs/guides/experimentation/funnel-optimization
//
// The flag below selects which sign-up UI a context sees. Each funnel step
// records a custom event with ldClient.track(); those events feed the funnel
// metric group that the experiment measures. See the README for the exact
// LaunchDarkly UI setup required to see results.

// Flag with three string variations: "control", "dropdown", "radio".
const FLAG_KEY = 'signup-flow-variation';

// One custom event per funnel step, tracked in the order the user hits them.
// Create a metric (Custom / "Count distinct units (Percent)") for each, then
// combine them — in this order — into a funnel metric group.
const EVENT_SIGNUP_STARTED = 'signup-button-clicked';
const EVENT_INFO_ENTERED = 'signup-info-entered';
const EVENT_SIGNUP_COMPLETED = 'signup-completed';

type Step = 'start' | 'info' | 'pay' | 'done';
type Plan = 'basic' | 'pro';

export default function SignupFunnel() {
  const ldClient = useLDClient();
  // Reactive hook: the value updates if targeting changes. The per-call default
  // ('control') is returned before the flag loads or if the flag is missing.
  // Evaluating the flag here (where the experience renders) records the
  // experiment exposure event.
  const variation = useStringVariation(FLAG_KEY, 'control');

  const [step, setStep] = useState<Step>('start');
  const [plan, setPlan] = useState<Plan | null>(null);

  // Each step records a custom event. LaunchDarkly uses these for the funnel
  // metric group, and the Observability plugin also records each one as a
  // `track` span automatically.
  const startSignup = () => {
    ldClient.track(EVENT_SIGNUP_STARTED);
    setStep('info');
  };

  const submitInfo = () => {
    if (!plan) return;
    ldClient.track(EVENT_INFO_ENTERED, { plan });
    setStep('pay');
  };

  const completeSignup = () => {
    if (!plan) return;
    // The optional third argument is a numeric metric value.
    ldClient.track(EVENT_SIGNUP_COMPLETED, { plan }, 1);
    // Flush so exposure + conversion events reach LaunchDarkly promptly. In a
    // real app, also flush from an AppState listener when leaving `active`.
    ldClient.flush();
    setStep('done');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to LaunchDarkly</Text>
      <Text style={styles.subtitle}>Sign-up funnel experiment</Text>
      <Text style={styles.meta}>Variation: {variation}</Text>

      {step === 'start' && (
        <Pressable style={styles.button} onPress={startSignup}>
          <Text style={styles.buttonText}>Sign up</Text>
        </Pressable>
      )}

      {step === 'info' && (
        <View style={styles.section}>
          <Text style={styles.label}>Choose a plan</Text>
          <PlanPicker variation={variation} plan={plan} onSelect={setPlan} />
          <Pressable
            style={[styles.button, !plan && styles.buttonDisabled]}
            onPress={submitInfo}
            disabled={!plan}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </View>
      )}

      {step === 'pay' && (
        <View style={styles.section}>
          <Text style={styles.label}>You selected: {plan}</Text>
          <Pressable style={styles.button} onPress={completeSignup}>
            <Text style={styles.buttonText}>Complete sign-up</Text>
          </Pressable>
        </View>
      )}

      {step === 'done' && <Text style={styles.done}>🎉 Sign-up complete!</Text>}
    </View>
  );
}

// The flag controls how plan options are presented — this is the change under
// experiment. Each variation renders a different selection UI.
function PlanPicker({
  variation,
  plan,
  onSelect,
}: {
  variation: string;
  plan: Plan | null;
  onSelect: (plan: Plan) => void;
}) {
  const plans: Plan[] = ['basic', 'pro'];

  if (variation === 'radio') {
    return (
      <View>
        {plans.map((p) => (
          <Pressable key={p} style={styles.radioRow} onPress={() => onSelect(p)}>
            <View style={[styles.radioOuter, plan === p && styles.radioOuterOn]}>
              {plan === p && <View style={styles.radioInner} />}
            </View>
            <Text style={styles.radioLabel}>{p}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  if (variation === 'dropdown') {
    // A lightweight "dropdown": tap to cycle through the options.
    const cycle = () => onSelect(plan === 'basic' ? 'pro' : 'basic');
    return (
      <Pressable style={styles.dropdown} onPress={cycle}>
        <Text style={styles.dropdownText}>{plan ?? 'Select a plan ▾'}</Text>
      </Pressable>
    );
  }

  // control: plain side-by-side buttons
  return (
    <View style={styles.controlRow}>
      {plans.map((p) => (
        <Pressable
          key={p}
          style={[styles.chip, plan === p && styles.chipOn]}
          onPress={() => onSelect(p)}
        >
          <Text style={[styles.chipText, plan === p && styles.chipTextOn]}>{p}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 15, color: '#444', marginTop: 4 },
  meta: { fontSize: 13, color: '#888', marginTop: 8, marginBottom: 24 },
  section: { width: '100%', alignItems: 'center' },
  label: { fontSize: 15, marginBottom: 12 },
  button: {
    backgroundColor: '#405BFF',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonDisabled: { backgroundColor: '#b7c0ff' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  controlRow: { flexDirection: 'row', gap: 12 },
  chip: {
    borderWidth: 1,
    borderColor: '#405BFF',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  chipOn: { backgroundColor: '#405BFF' },
  chipText: { color: '#111' },
  chipTextOn: { color: '#fff' },
  dropdown: {
    borderWidth: 1,
    borderColor: '#405BFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 200,
    alignItems: 'center',
  },
  dropdownText: { fontSize: 16, color: '#111' },
  radioRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#405BFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioOuterOn: { borderColor: '#405BFF' },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#405BFF',
  },
  radioLabel: { fontSize: 16, textTransform: 'capitalize' },
  done: { fontSize: 18, fontWeight: '600', color: '#1a7f37' },
});
