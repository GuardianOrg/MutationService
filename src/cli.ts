#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as toml from 'toml';
import chalk from 'chalk';
import { runMutationTest } from './commands/run';
import { MutationConfig } from './types';

const program = new Command();

// Read version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

program
  .name('forge-mutation-tester')
  .description('AI-powered mutation testing tool for Solidity smart contracts')
  .version(packageJson.version);

program
  .argument('<config>', 'Path to TOML configuration file')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (configPath: string, options: { verbose?: boolean }) => {
    try {
      // Check if config file exists
      if (!fs.existsSync(configPath)) {
        console.error(chalk.red(`Error: Configuration file not found: ${configPath}`));
        process.exit(1);
      }

      // Read and parse TOML config
      const configContent = fs.readFileSync(configPath, 'utf-8');
      let config: MutationConfig;
      
      try {
        config = toml.parse(configContent) as MutationConfig;
      } catch (parseError: any) {
        console.error(chalk.red(`Error parsing TOML configuration: ${parseError.message}`));
        process.exit(1);
      }

      // Validate configuration
      if (!config.openai?.api_key) {
        console.log(chalk.yellow('⚠️  Warning: No OpenAI API key provided'));
        console.log(chalk.dim('  Mutation testing will run, but no tests will be generated.'));
        console.log(chalk.dim('  To enable AI test generation, add your API key to the config:'));
        console.log(chalk.dim('  [openai]'));
        console.log(chalk.dim('  api_key = "sk-..."'));
        console.log('');
      }

      if (!config.repository?.url && !config.repository?.local_path) {
        console.error(chalk.red('Error: Either repository.url or repository.local_path must be provided'));
        process.exit(1);
      }

      if (config.repository?.url && config.repository?.local_path) {
        console.error(chalk.red('Error: Cannot use both repository.url and repository.local_path. Choose one.'));
        process.exit(1);
      }

      // Convert config to RunOptions format
      const runOptions = {
        repo: config.repository?.url,
        localPath: config.repository?.local_path,
        token: config.repository?.token,
        branch: config.repository?.branch || 'main',
        output: config.output?.directory || 'mutation-results',
        openaiKey: config.openai?.api_key,
        model: config.openai?.model || 'gpt-4-turbo-preview',
        cleanup: config.output?.cleanup !== false, // Default true
        iterative: config.testing?.iterative !== false,  // Default true
        numMutants: config.testing?.num_mutants || 25    // Default 25
      };

      if (options.verbose) {
        console.log(chalk.dim('Using configuration:'));
        console.log(chalk.dim(JSON.stringify(runOptions, null, 2)));
      }

      // Run mutation testing
      await runMutationTest(runOptions);
    } catch (error: any) {
      console.error(chalk.red('Error:', error.message));
      if (options.verbose && error.stack) {
        console.error(chalk.dim(error.stack));
      }
      process.exit(1);
    }
  });

// Add example command
program
  .command('init')
  .description('Create an example configuration file')
  .action(() => {
    const exampleConfig = `# Forge Mutation Tester Configuration

[repository]
# Use EITHER url OR local_path, not both
# url = "https://github.com/owner/repo"
local_path = "./path/to/your/project"
# branch = "main"  # Optional, defaults to 'main'
# token = "ghp_..."  # Optional, for private repos

[openai]
# api_key = "sk-..."  # Optional - your OpenAI API key for test generation
# model = "gpt-4-turbo-preview"  # Optional, defaults to 'gpt-4-turbo-preview'

[output]
# directory = "mutation-results"  # Optional, defaults to 'mutation-results'
# cleanup = true  # Optional, defaults to true (only applies to cloned repos)

[testing]
# iterative = true  # Optional, defaults to true (set to false to disable)
# num_mutants = 25  # Optional, defaults to 25 mutants per file
`;

    const configPath = 'mutation-config.toml';
    if (fs.existsSync(configPath)) {
      console.error(chalk.yellow(`Warning: ${configPath} already exists. Not overwriting.`));
      process.exit(1);
    }

    fs.writeFileSync(configPath, exampleConfig);
    console.log(chalk.green(`✓ Created example configuration file: ${configPath}`));
    console.log(chalk.dim('Edit this file with your settings and run:'));
    console.log(chalk.cyan(`  forge-mutation-tester ${configPath}`));
  });

program.parse(process.argv);

// Show help if no arguments
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 