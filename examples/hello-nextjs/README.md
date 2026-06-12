# LaunchDarkly sample Next.js application

We've built a simple web application that demonstrates how LaunchDarkly's SDK works.

Below, you'll find the build procedure. For more comprehensive instructions, you can visit your [Quickstart page](https://app.launchdarkly.com/quickstart#/) or the [Node.js Server SDK reference guide](https://launchdarkly.com/docs/sdk/server-side/node-js) and [React Web SDK reference guide](https://launchdarkly.com/docs/sdk/client-side/react/react-web).

This demo requires Node 18 or higher LTS version.

## Build instructions

1. Create an `.env.local` file and set the following values:

   - `NEXT_PUBLIC_LD_CLIENT_ID` - Your LaunchDarkly client-side ID
   - `LD_SDK_KEY` - Your LaunchDarkly server SDK key

2. If there is an existing boolean feature flag in your LaunchDarkly project that you want to evaluate, update the flag key in `app/page.tsx`:

   ```Typescript
   const value = flags['my-boolean-flag'] ?? false;
   ```

`api/flag/route.ts`:

   ```Typescript
   const value = await client.variation('my-boolean-flag', context, false);
   ```

3. On the command line, run `npm install && npm run dev`.

You should see the message "Welcome to LaunchDarkly Flag value is <true/false>".

## Testing the API endpoint

This project also includes a server-side API route at `/api/flag` that demonstrates server-side flag evaluation using the Node Server SDK.

To test it, run:

```bash
curl http://localhost:3000/api/flag
```

You should receive a JSON response like `{"value": true}` or `{"value": false}`.
