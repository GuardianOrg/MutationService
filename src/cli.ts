#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import { runMutationTest } from './commands/run';
import { runCoverageAnalysis } from './commands/coverage';

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
  .option('-r, --repo <url>', 'Git repository URL (use this OR --local)')
  .option('-l, --local <path>', 'Path to local repository (use this OR --repo)')
  .option('-t, --token <token>', 'Personal Access Token for private repositories')
  .option('-b, --branch <branch>', 'Branch to test', 'main')
  .option('-o, --output <dir>', 'Output directory for generated tests', './generated-tests')
  .option('--openai-key <key>', 'OpenAI API key (or set OPENAI_API_KEY env var)')
  .option('--model <model>', 'OpenAI model to use', 'gpt-4-turbo-preview')
  .option('--no-cleanup', 'Keep cloned repository after testing')
  .option('-i, --iterative', 'Enable iterative mode - re-run after adding tests')
  .option('-w, --watch', 'Watch for test changes and re-run automatically')
  .action(async (options) => {
    try {
      // Validate that either repo or local is provided
      if (!options.repo && !options.local) {
        console.error(chalk.red('Error: Either --repo or --local must be provided'));
        process.exit(1);
      }
      
      if (options.repo && options.local) {
        console.error(chalk.red('Error: Cannot use both --repo and --local. Choose one.'));
        process.exit(1);
      }

      // Validate OpenAI API key
      const apiKey = options.openaiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error(chalk.red('Error: OpenAI API key is required. Set OPENAI_API_KEY env var or use --openai-key flag'));
        process.exit(1);
      }

      await runMutationTest({
        ...options,
        localPath: options.local,
        openaiKey: apiKey
      });
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program
  .command('coverage')
  .description('Analyze test coverage and generate tests to increase coverage')
  .option('-r, --repo <url>', 'Git repository URL (use this OR --local)')
  .option('-l, --local <path>', 'Path to local repository (use this OR --repo)')
  .option('-t, --token <token>', 'Personal Access Token for private repositories')
  .option('-b, --branch <branch>', 'Branch to test', 'main')
  .option('-o, --output <dir>', 'Output directory for generated tests', './generated-coverage-tests')
  .option('--openai-key <key>', 'OpenAI API key (or set OPENAI_API_KEY env var)')
  .option('--model <model>', 'OpenAI model to use', 'gpt-4-turbo-preview')
  .option('--target-coverage <percentage>', 'Target coverage percentage', '95')
  .option('--no-cleanup', 'Keep cloned repository after testing')
  .action(async (options) => {
    try {
      // Validate that either repo or local is provided
      if (!options.repo && !options.local) {
        console.error(chalk.red('Error: Either --repo or --local must be provided'));
        process.exit(1);
      }
      
      if (options.repo && options.local) {
        console.error(chalk.red('Error: Cannot use both --repo and --local. Choose one.'));
        process.exit(1);
      }

      // Validate OpenAI API key
      const apiKey = options.openaiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error(chalk.red('Error: OpenAI API key is required. Set OPENAI_API_KEY env var or use --openai-key flag'));
        process.exit(1);
      }

      await runCoverageAnalysis({
        ...options,
        localPath: options.local,
        openaiKey: apiKey,
        targetCoverage: parseInt(options.targetCoverage)
      });
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program.parse(); 