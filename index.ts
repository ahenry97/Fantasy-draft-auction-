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

const MODEL = 'openai/gpt-5.6-sol';

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY is not set — add it to .env.local');
  }

  const result = streamText({
    model: MODEL,
    prompt:
      'In two sentences, explain why a fantasy football league might auction off draft slots instead of randomizing them.',
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  const usage = await result.usage;
  console.log('\n\n--- usage ---');
  console.log(`model:         ${MODEL}`);
  console.log(`input tokens:  ${usage.inputTokens}`);
  console.log(`output tokens: ${usage.outputTokens}`);
  console.log(`total tokens:  ${usage.totalTokens}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
