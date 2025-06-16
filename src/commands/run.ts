import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { RunOptions, MutationSummary } from '../types';
import { GitService } from '../services/git.service';
import { GambitService } from '../services/gambit.service';
import { AIService } from '../services/ai.service';
import * as readline from 'readline';

export async function runMutationTest(options: RunOptions): Promise<void> {
  console.log(chalk.bold.blue('\n🧬 Forge Mutation Tester\n'));
  
  const gitService = new GitService();
  const gambitService = new GambitService();
  const aiService = new AIService(options.openaiKey, options.model);
  
  let repoPath: string | null = null;

  try {
    // Step 1: Clone the repository
    console.log(chalk.bold('Step 1: Cloning repository...'));
    const tempDir = path.join(process.cwd(), '.mutation-testing-temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    repoPath = await gitService.cloneRepository(
      options.repo,
      tempDir,
      options.branch,
      options.token
    );

    // Step 2: Give setup instructions and wait for user confirmation
    console.log(chalk.bold('\n📋 Step 2: Project Setup Required'));
    await displaySetupInstructions(repoPath);
    
    const isReady = await waitForUserConfirmation();
    if (!isReady) {
      console.log(chalk.yellow('\n⏸️  Setup cancelled. Please run the command again when your project is ready.'));
      return;
    }

    // Step 3: Setup and run mutation testing
    console.log(chalk.bold('\nStep 3: Setting up and running mutation tests...'));
    await gambitService.setupGambitConfigWithoutDependencies(repoPath);
    const mutationResults = await gambitService.runMutationTestingWithoutSetup(repoPath);
    
    // Step 4: Analyze survived mutations
    console.log(chalk.bold('\nStep 4: Analyzing mutation testing results...'));
    
    const totalMutations = mutationResults.length;
    const killedMutations = mutationResults.filter(r => r.status === 'killed').length;
    const survivedMutations = mutationResults.filter(r => r.status === 'survived').length;
    const errorMutations = mutationResults.filter(r => r.status === 'error').length;
    const mutationScore = totalMutations > 0 ? (killedMutations / totalMutations) * 100 : 0;
    
    console.log(chalk.cyan('\n📊 Mutation Testing Results:'));
    console.log(`  • Total mutations tested: ${totalMutations}`);
    console.log(`  • Mutations killed by tests: ${killedMutations}`);
    console.log(`  • Mutations that survived: ${survivedMutations}`);
    if (errorMutations > 0) {
      console.log(`  • Mutations with errors: ${errorMutations}`);
    }
    console.log(`  • Mutation score: ${mutationScore.toFixed(2)}%`);
    
    if (survivedMutations === 0) {
      console.log(chalk.green('\n✅ Excellent! All mutations were killed. Your test suite is comprehensive!'));
      console.log(chalk.green('No gaps detected in your testing coverage.'));
      return;
    }

    const survivedMutationResults = mutationResults.filter(r => r.status === 'survived');
    console.log(chalk.yellow(`\n⚠️  Found ${survivedMutations} survived mutations indicating gaps in test coverage`));

    // Step 5: Generate tests for gaps
    console.log(chalk.bold('\nStep 5: Generating tests to cover gaps...'));
    const gaps = await aiService.analyzeGaps(survivedMutationResults, repoPath);
    const generatedTests = await aiService.generateTests(gaps, repoPath);

    // Step 6: Save generated tests
    console.log(chalk.bold('\nStep 6: Saving generated tests...'));
    await saveGeneratedTests(generatedTests, options.output);

    // Step 7: Generate and save summary
    console.log(chalk.bold('\nStep 7: Generating summary report...'));
    const summary = await aiService.generateSummary(mutationResults, generatedTests);
    await saveSummary(summary, options.output);

    // Display results
    console.log(chalk.bold.green('\n✅ Mutation testing completed successfully!\n'));
    console.log(chalk.cyan('Results:'));
    console.log(`  • Total mutations: ${mutationResults.length}`);
    console.log(`  • Killed mutations: ${mutationResults.filter((r: any) => r.status === 'killed').length}`);
    console.log(`  • Survived mutations: ${survivedMutations}`);
    console.log(`  • Mutation score: ${mutationScore.toFixed(2)}%`);
    console.log(`  • Generated test files: ${generatedTests.length}`);
    console.log(`\nOutput saved to: ${chalk.underline(options.output)}`);

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error);
    throw error;
  } finally {
    // Cleanup
    if (repoPath && options.cleanup) {
      console.log(chalk.dim('\nCleaning up...'));
      await gitService.cleanup(repoPath);
    }
  }
}

async function displaySetupInstructions(repoPath: string): Promise<void> {
  console.log(chalk.cyan('\n📁 Repository cloned to:'), chalk.underline(repoPath));
  console.log(chalk.bold('\n🔧 Please complete the following setup steps:\n'));

  // Check project type
  const foundryTomlExists = await fs.access(path.join(repoPath, 'foundry.toml')).then(() => true).catch(() => false);
  const hardhatConfigExists = await fs.access(path.join(repoPath, 'hardhat.config.js')).then(() => true).catch(() => 
    fs.access(path.join(repoPath, 'hardhat.config.ts')).then(() => true).catch(() => false)
  );

  if (foundryTomlExists) {
    console.log(chalk.green('🔨 Detected Forge/Foundry project\n'));
    console.log(chalk.yellow('Run these commands in your terminal:\n'));
    console.log(chalk.cyan(`cd ${repoPath}`));
    console.log(chalk.cyan('forge install'));
    console.log(chalk.cyan('forge build'));
    console.log(chalk.cyan('forge test'));
    console.log(chalk.yellow('\n📦 Install Solidity compiler (EXACT VERSION REQUIRED):'));
    console.log(chalk.cyan('# Check your project\'s solidity version first:'));
    console.log(chalk.cyan('grep "pragma solidity" src/*.sol | head -1'));
    console.log(chalk.cyan('# Install solc-select and matching version:'));
    console.log(chalk.cyan('pip3 install solc-select'));
    console.log(chalk.cyan('solc-select install 0.8.26  # Use your project\'s version'));
    console.log(chalk.cyan('solc-select use 0.8.26'));
    console.log(chalk.cyan('export PATH="/Users/$USER/Library/Python/3.9/bin:$PATH"'));
  } else if (hardhatConfigExists) {
    console.log(chalk.green('⚒️  Detected Hardhat project\n'));
    console.log(chalk.yellow('Run these commands in your terminal:\n'));
    console.log(chalk.cyan(`cd ${repoPath}`));
    console.log(chalk.cyan('npm install'));
    console.log(chalk.cyan('npx hardhat compile'));
    console.log(chalk.cyan('npx hardhat test'));
    console.log(chalk.yellow('\n📦 Install Solidity compiler (EXACT VERSION REQUIRED):'));
    console.log(chalk.cyan('# Check your project\'s solidity version first:'));
    console.log(chalk.cyan('grep "pragma solidity" contracts/*.sol | head -1'));
    console.log(chalk.cyan('# Install solc-select and matching version:'));
    console.log(chalk.cyan('pip3 install solc-select'));
    console.log(chalk.cyan('solc-select install <YOUR_VERSION>  # e.g., 0.8.26'));
    console.log(chalk.cyan('solc-select use <YOUR_VERSION>'));
    console.log(chalk.cyan('export PATH="/Users/$USER/Library/Python/3.9/bin:$PATH"'));
  } else {
    console.log(chalk.yellow('❓ Unknown project type detected\n'));
    console.log(chalk.yellow('Please ensure your project is set up with:\n'));
    console.log(chalk.cyan(`cd ${repoPath}`));
    console.log(chalk.cyan('# Install dependencies'));
    console.log(chalk.cyan('# Compile contracts'));
    console.log(chalk.cyan('# Run tests to ensure they pass'));
    console.log(chalk.cyan('# Install solc globally (see below)'));
    console.log(chalk.yellow('\n📦 Install Solidity compiler (EXACT VERSION REQUIRED):'));
    console.log(chalk.cyan('# Check your project\'s solidity version first'));
    console.log(chalk.cyan('# Install solc-select and matching version:'));
    console.log(chalk.cyan('pip3 install solc-select'));
    console.log(chalk.cyan('solc-select install <YOUR_VERSION>'));
    console.log(chalk.cyan('solc-select use <YOUR_VERSION>'));
    console.log(chalk.cyan('export PATH="/Users/$USER/Library/Python/3.9/bin:$PATH"'));
  }

  console.log(chalk.bold('\n✅ Requirements:'));
  console.log('  • All dependencies installed');
  console.log('  • All contracts compile successfully');
  console.log('  • All existing tests pass');
  console.log('  • Solidity compiler (solc) with EXACT version matching project');
  console.log('  • Project is ready for mutation testing');

  console.log(chalk.bold('\n📝 Notes:'));
  console.log('  • Only source .sol files will be mutated (test files excluded)');
  console.log('  • Gambit will be installed automatically if needed');
  console.log('  • Make sure you have Rust/Cargo installed for Gambit compilation');
}

async function waitForUserConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(chalk.bold('\n❓ Is your project ready for mutation testing?'));
    rl.question(chalk.cyan('Type "yes" or "y" to continue, anything else to cancel: '), (answer) => {
      rl.close();
      const normalizedAnswer = answer.toLowerCase().trim();
      resolve(normalizedAnswer === 'yes' || normalizedAnswer === 'y');
    });
  });
}

async function saveGeneratedTests(tests: any[], outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  
  for (const test of tests) {
    const testPath = path.join(outputDir, test.fileName);
    await fs.writeFile(testPath, test.content);
    console.log(chalk.green(`  ✓ Saved ${test.fileName}`));
  }
}

async function saveSummary(summary: string, outputDir: string): Promise<void> {
  const summaryPath = path.join(outputDir, 'mutation-testing-summary.md');
  await fs.writeFile(summaryPath, summary);
  console.log(chalk.green(`  ✓ Saved summary report`));
} 