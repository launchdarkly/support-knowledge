import { NextResponse } from 'next/server';
import { getLDClient } from '@/app/lib/ld-server';

export const runtime = 'nodejs';

export async function GET() {
  const context = { kind: 'user', key: 'user-123' };
  const client = getLDClient();

  await client.waitForInitialization({ timeout: 5 });
  //TODO Set my-boolean-flag to a valid boolean flag key in your project/environment.
  const value = await client.variation('bool-flag', context, false);
  return NextResponse.json({ value });
}
