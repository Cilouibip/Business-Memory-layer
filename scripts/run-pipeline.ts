import { runPipeline } from '../src/pipeline/orchestrator';

type CliOptions = {
  sources?: Array<'youtube' | 'linkedin' | 'notion'>;
  skipSync?: boolean;
  limit?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--skip-sync') {
      options.skipSync = true;
      continue;
    }

    if (arg === '--sources') {
      const value = argv[index + 1] ?? '';
      index += 1;
      const parsed = value
        .split(',')
        .map((source) => source.trim())
        .filter((source): source is 'youtube' | 'linkedin' | 'notion' => {
          return source === 'youtube' || source === 'linkedin' || source === 'notion';
        });

      if (parsed.length > 0) {
        options.sources = parsed;
      }

      continue;
    }

    if (arg === '--limit') {
      const value = Number(argv[index + 1]);
      index += 1;
      if (!Number.isNaN(value) && value > 0) {
        options.limit = value;
      }
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runPipeline(options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[pipeline:run] failed', error instanceof Error ? error.message : error);
  process.exit(1);
});
