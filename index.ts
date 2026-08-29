/**
 * AI Gateway smoke test.
 *
 * Streams a completion through Vercel AI Gateway and prints token usage.
 * Requires AI_GATEWAY_API_KEY in .env.local.
 *
 *   npm run ai:check
 */
import 'dotenv/config';
import { config } from 'dotenv';
import { streamText } from 'ai';

config({ path: '.env.local', override: true, quiet: true });

// Override with AI_MODEL=... to try a different model without editing this file.
const MODEL = process.env.AI_MODEL ?? 'openai/gpt-5.6-sol';

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY is not set — add it to .env.local');
  }

  // streamText surfaces provider failures through onError; the promise itself
  // only rejects with a generic "no output generated" once the stream closes.
  let streamError: unknown;

  const result = streamText({
    onError: ({ error }) => {
      streamError = error;
    },
    model: MODEL,
    prompt:
      'In two sentences, explain why a fantasy football league might auction off draft slots instead of randomizing them.',
  });

  try {
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
  } catch (err) {
    throw streamError ?? err;
  }
  if (streamError) throw streamError;

  const usage = await result.usage;
  console.log('\n\n--- usage ---');
  console.log(`model:         ${MODEL}`);
  console.log(`input tokens:  ${usage.inputTokens}`);
  console.log(`output tokens: ${usage.outputTokens}`);
  console.log(`total tokens:  ${usage.totalTokens}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/free tier/i.test(msg)) {
    console.error(
      `\n${msg}\n\nThe gateway key and model slug are fine — this team has no paid AI Gateway ` +
        `credits.\nTop up at Vercel → AI → Top up, or set AI_MODEL to a model your plan covers.`,
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
