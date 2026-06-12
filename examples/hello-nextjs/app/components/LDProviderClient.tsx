'use client';

import { LDProvider } from 'launchdarkly-react-client-sdk';
import { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  context: { kind: string; key: string };
}>;

export default function LDProviderClient({ children, context }: Props) {
  const clientSideID = process.env.NEXT_PUBLIC_LD_CLIENT_SIDE_ID;

  if (!clientSideID) {
    return <>{children}</>;
  }

  return (
    <LDProvider clientSideID={clientSideID} context={context}>
      {children}
    </LDProvider>
  );
}

