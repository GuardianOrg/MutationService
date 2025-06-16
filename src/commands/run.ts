import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { RunOptions, MutationSummary } from '../types';
import { GitService } from '../services/git.service';
import { GambitService } from '../services/gambit.service';
import { AIService } from '../services/ai.service';
import * as readline from 'readline';

// Helper functions for mutation analysis display
function getScoreEmoji(score: number): string {
  if (score >= 90) return '🏆';
  if (score >= 80) return '🥇';
  if (score >= 70) return '🥈';
  if (score >= 60) return '🥉';
  if (score >= 50) return '⚠️';
  return '🚨';
}

function getScoreGrade(score: number): string {
  if (score >= 90) return 'Grade: A - Exceptional test quality! Your tests are robust and comprehensive.';
  if (score >= 80) return 'Grade: B - Good test coverage with room for improvement in critical areas.';
  if (score >= 70) return 'Grade: C - Moderate test quality. Focus on security and edge case testing.';
  if (score >= 60) return 'Grade: D - Below average. Significant gaps in test coverage detected.';
  if (score >= 50) return 'Grade: F - Poor test quality. Consider adopting Test-Driven Development.';
  return 'Grade: F - Critical issues detected. Immediate attention required for production readiness.';
}

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
    
    // Step 4: Analyze mutation testing results
    console.log(chalk.bold('\nStep 4: Analyzing mutation testing results...'));
    
    const mutationAnalysisResult = await gambitService.generateMutationAnalysis(mutationResults, repoPath);
    const { guardianScore, analysis, reportMarkdown } = mutationAnalysisResult;
    
    // Display Guardian Mutation Score and key insights
    console.log(chalk.bold.blue('\n🛡️ Guardian Mutation Analysis'));
    console.log(chalk.cyan(`Guardian Mutation Score: ${guardianScore}/100 ${getScoreEmoji(guardianScore)}`));
    console.log(chalk.dim(`${getScoreGrade(guardianScore)}`));
    
    console.log(chalk.cyan('\n📊 Quick Stats:'));
    console.log(`  • Total mutations tested: ${analysis.summary.totalMutants}`);
    console.log(`  • Mutations killed: ${analysis.summary.killedMutants} (${analysis.summary.basicMutationScore.toFixed(1)}%)`);
    console.log(`  • Mutations survived: ${analysis.summary.survivedMutants}`);
    if (analysis.summary.errorMutants > 0) {
      console.log(`  • Test errors: ${analysis.summary.errorMutants}`);
    }
    
    // Show top recommendations immediately
    if (analysis.recommendations.length > 0) {
      console.log(chalk.yellow('\n🎯 Top Recommendations:'));
      analysis.recommendations.slice(0, 3).forEach((rec: string, index: number) => {
        console.log(chalk.yellow(`  ${index + 1}. ${rec}`));
      });
    }
    
    // Show critical gaps if any
    if (analysis.criticalGaps.length > 0) {
      console.log(chalk.red('\n🚨 Critical Gaps (Immediate Attention Required):'));
      analysis.criticalGaps.slice(0, 3).forEach((gap: any, index: number) => {
        console.log(chalk.red(`  ${index + 1}. ${gap.file}:${gap.line} - ${gap.mutationType}`));
        console.log(chalk.red(`     "${gap.original}" → "${gap.mutated}" (Priority: ${gap.priority})`));
      });
    }

    if (analysis.summary.survivedMutants === 0) {
      console.log(chalk.green('\n✅ Excellent! All mutations were killed. Your test suite is comprehensive!'));
      console.log(chalk.green('No gaps detected in your testing coverage.'));
      
      // Save the analysis report even for perfect scores
      await saveMutationAnalysis(reportMarkdown, options.output);
      console.log(chalk.bold.green('\n✅ Mutation testing completed successfully!\n'));
      console.log(chalk.cyan('Results:'));
      console.log(`  • Guardian Mutation Score: ${guardianScore}/100`);
      console.log(`  • Total mutations: ${mutationResults.length}`);
      console.log(`  • All mutations killed: 100%`);
      console.log(`\nDetailed analysis saved to: ${chalk.underline(path.join(options.output, 'guardian-mutation-analysis.md'))}`);
      return;
    }

    const survivedMutationResults = mutationResults.filter(r => r.status === 'survived');
    console.log(chalk.yellow(`\n⚠️  Found ${analysis.summary.survivedMutants} survived mutations indicating gaps in test coverage`));

    // Step 5: Generate tests for gaps
    console.log(chalk.bold('\nStep 5: Generating tests to cover gaps...'));
    const gaps = await aiService.analyzeGaps(survivedMutationResults, repoPath);
    const generatedTests = await aiService.generateTests(gaps, repoPath);

    // Step 6: Save generated tests
    console.log(chalk.bold('\nStep 6: Saving generated tests...'));
    await saveGeneratedTests(generatedTests, options.output);

    // Step 7: Save mutation analysis report
    console.log(chalk.bold('\nStep 7: Saving mutation analysis report...'));
    await saveMutationAnalysis(reportMarkdown, options.output);

    // Step 8: Generate and save summary
    console.log(chalk.bold('\nStep 8: Generating summary report...'));
    const summary = await aiService.generateSummary(mutationResults, generatedTests);
    await saveSummary(summary, options.output);

    // Display results
    console.log(chalk.bold.green('\n✅ Mutation testing completed successfully!\n'));
    console.log(chalk.cyan('Results:'));
    console.log(`  • Guardian Mutation Score: ${guardianScore}/100 ${getScoreEmoji(guardianScore)}`);
    console.log(`  • Total mutations: ${mutationResults.length}`);
    console.log(`  • Killed mutations: ${mutationResults.filter((r: any) => r.status === 'killed').length}`);
    console.log(`  • Survived mutations: ${analysis.summary.survivedMutants}`);
    console.log(`  • Basic mutation score: ${analysis.summary.basicMutationScore.toFixed(2)}%`);
    console.log(`  • Generated test files: ${generatedTests.length}`);
    console.log(`\nOutput saved to: ${chalk.underline(options.output)}`);
    console.log(`Detailed analysis: ${chalk.underline(path.join(options.output, 'guardian-mutation-analysis.md'))}`);

    // Show final recommendations
    if (analysis.recommendations.length > 3) {
      console.log(chalk.yellow(`\n💡 See the detailed analysis report for ${analysis.recommendations.length - 3} additional recommendations`));
    }

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

async function saveMutationAnalysis(reportMarkdown: string, outputDir: string): Promise<void> {
  const analysisPath = path.join(outputDir, 'guardian-mutation-analysis.md');
  await fs.writeFile(analysisPath, reportMarkdown);
  console.log(chalk.green(`  ✓ Saved mutation analysis report`));
} 