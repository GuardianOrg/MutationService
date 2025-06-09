#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import { runMutationTest } from './commands/run';

// Load environment variables
config();

const program = new Command();

program
  .name('forge-mutation-tester')
  .description('AI-powered mutation testing tool that generates Forge tests to cover gaps')
  .version('1.0.0'); // Hardcoded version to avoid import issues

program
  .command('run')
  .description('Run mutation testing on a repository and generate Forge tests')
  .requiredOption('-r, --repo <url>', 'Git repository URL')
  .option('-t, --token <token>', 'Personal Access Token for private repositories')
  .option('-b, --branch <branch>', 'Branch to test', 'main')
  .option('-o, --output <dir>', 'Output directory for generated tests', './generated-tests')
  .option('--openai-key <key>', 'OpenAI API key (or set OPENAI_API_KEY env var)')
  .option('--model <model>', 'OpenAI model to use', 'gpt-4-turbo-preview')
  .option('--no-cleanup', 'Keep cloned repository after testing')
  .action(async (options) => {
    try {
      // Validate OpenAI API key
      const apiKey = options.openaiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error(chalk.red('Error: OpenAI API key is required. Set OPENAI_API_KEY env var or use --openai-key flag'));
        process.exit(1);
      }

      await runMutationTest({
        ...options,
        openaiKey: apiKey
      });
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program.parse(); 