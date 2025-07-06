import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RunOptions } from '../types';
import { GitService } from '../services/git.service';
import { AIService } from '../services/ai.service';
import * as readline from 'readline';

const execAsync = promisify(exec);

interface CoverageOptions extends RunOptions {
  targetCoverage: number;
}

// Import coverage types from the service
import type { CoverageReport, PrioritizedUncovered } from '../services/coverage.service';

export async function runCoverageAnalysis(options: CoverageOptions): Promise<void> {
  console.log(chalk.bold.blue('\n📊 Forge Coverage Analyzer & Test Generator\n'));
  
  const gitService = new GitService();
  const aiService = new AIService(options.openaiKey, options.model);
  
  let repoPath: string | null = null;
  let isLocalMode = false;

  try {
    // Step 1: Clone repository OR use local path
    if (options.localPath) {
      console.log(chalk.bold('Step 1: Using local repository...'));
      repoPath = path.resolve(options.localPath);
      isLocalMode = true;
      
      // Verify the path exists
      try {
        await fs.access(repoPath);
        console.log(chalk.green(`✓ Using local repository at: ${repoPath}`));
      } catch {
        throw new Error(`Local repository path does not exist: ${repoPath}`);
      }
    } else if (options.repo) {
      console.log(chalk.bold('Step 1: Cloning repository...'));
      const tempDir = path.join(process.cwd(), '.coverage-analysis-temp');
      await fs.mkdir(tempDir, { recursive: true });
      
      repoPath = await gitService.cloneRepository(
        options.repo,
        tempDir,
        options.branch,
        options.token
      );
    } else {
      throw new Error('Either repo URL or local path must be provided');
    }

    // Step 2: Check if already set up or needs setup
    const needsSetup = !isLocalMode || !(await isProjectSetup(repoPath));
    
    if (needsSetup) {
      console.log(chalk.bold('\n📋 Step 2: Project Setup Required'));
      await displayCoverageSetupInstructions(repoPath);
      
      const isReady = await waitForUserConfirmation();
      if (!isReady) {
        console.log(chalk.yellow('\n⏸️  Setup cancelled. Please run the command again when your project is ready.'));
        return;
      }
    } else {
      console.log(chalk.bold('\n✅ Step 2: Project already set up'));
    }

    // Step 3: Analyze current coverage
    console.log(chalk.bold('\nStep 3: Analyzing current test coverage...'));
    const coverageReport = await analyzeCoverage(repoPath);
    
    console.log(chalk.cyan('\n📊 Current Coverage Summary:'));
    console.log(`  • Overall Coverage: ${coverageReport.overallCoverage.toFixed(2)}%`);
    console.log(`  • Target Coverage: ${options.targetCoverage}%`);
    console.log(`  • Uncovered Lines: ${coverageReport.uncoveredLines.length}`);
    console.log(`  • Uncovered Functions: ${coverageReport.uncoveredFunctions.length}`);

    if (coverageReport.overallCoverage >= options.targetCoverage) {
      console.log(chalk.green(`\n✅ Excellent! Coverage is already at ${coverageReport.overallCoverage.toFixed(2)}%, which meets your target of ${options.targetCoverage}%!`));
      return;
    }

    const coverageGap = options.targetCoverage - coverageReport.overallCoverage;
    console.log(chalk.yellow(`\n⚠️  Coverage gap: ${coverageGap.toFixed(2)}% to reach target`));

    // Step 4: Generate tests for uncovered code
    console.log(chalk.bold('\nStep 4: Generating tests to increase coverage...'));
    const prioritizedUncovered = await prioritizeUncoveredCode(coverageReport);
    const generatedTests = await aiService.generateCoverageTests(prioritizedUncovered, repoPath);

    // Step 5: Save generated tests
    console.log(chalk.bold('\nStep 5: Saving generated tests...'));
    await saveGeneratedTests(generatedTests, options.output);

    // Step 6: Generate coverage summary
    console.log(chalk.bold('\nStep 6: Generating coverage report...'));
    const summary = await aiService.generateCoverageSummary(coverageReport, generatedTests, options.targetCoverage);
    await saveCoverageSummary(summary, options.output);

    // Display results
    console.log(chalk.bold.green('\n✅ Coverage analysis completed successfully!\n'));
    console.log(chalk.cyan('Results:'));
    console.log(`  • Current Coverage: ${coverageReport.overallCoverage.toFixed(2)}%`);
    console.log(`  • Target Coverage: ${options.targetCoverage}%`);
    console.log(`  • Estimated New Coverage: ${(coverageReport.overallCoverage + (generatedTests.length * 2)).toFixed(2)}%`);
    console.log(`  • Generated test files: ${generatedTests.length}`);
    console.log(`  • Uncovered lines addressed: ${prioritizedUncovered.lines.length}`);
    console.log(`\nOutput saved to: ${chalk.underline(options.output)}`);

    console.log(chalk.bold('\n📝 Next Steps:'));
    console.log(`  1. Review generated tests in ${options.output}`);
    console.log(`  2. Add tests to your test suite`);
    console.log(`  3. Run coverage analysis again to verify improvements`);

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error);
    throw error;
  } finally {
    // Cleanup only if not local mode and cleanup is enabled
    if (repoPath && !isLocalMode && options.cleanup) {
      console.log(chalk.dim('\nCleaning up...'));
      await gitService.cleanup(repoPath);
    }
  }
}

async function analyzeCoverage(projectPath: string): Promise<CoverageReport> {
  const CoverageService = (await import('../services/coverage.service')).CoverageService;
  const coverageService = new CoverageService();
  return await coverageService.analyzeCoverage(projectPath);
}

async function prioritizeUncoveredCode(coverageReport: CoverageReport): Promise<PrioritizedUncovered> {
  const CoverageService = (await import('../services/coverage.service')).CoverageService;
  const coverageService = new CoverageService();
  return await coverageService.prioritizeUncoveredCode(coverageReport);
}

// Removed generateCoverageTests and generateCoverageSummary - now using AI service methods

async function displayCoverageSetupInstructions(repoPath: string): Promise<void> {
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
    console.log(chalk.cyan('forge coverage'));
    console.log(chalk.yellow('\n📊 Coverage Analysis Requirements:'));
    console.log('  • All contracts compile successfully');
    console.log('  • All existing tests pass');
    console.log('  • Coverage tools are working (forge coverage runs)');
  } else if (hardhatConfigExists) {
    console.log(chalk.green('⚒️  Detected Hardhat project\n'));
    console.log(chalk.yellow('Run these commands in your terminal:\n'));
    console.log(chalk.cyan(`cd ${repoPath}`));
    console.log(chalk.cyan('npm install'));
    console.log(chalk.cyan('npx hardhat compile'));
    console.log(chalk.cyan('npx hardhat test'));
    console.log(chalk.cyan('npm install --save-dev solidity-coverage'));
    console.log(chalk.cyan('npx hardhat coverage'));
    console.log(chalk.yellow('\n📊 Coverage Analysis Requirements:'));
    console.log('  • All contracts compile successfully');
    console.log('  • All existing tests pass');
    console.log('  • Coverage tools are installed and working');
  } else {
    console.log(chalk.yellow('❓ Unknown project type detected\n'));
    console.log(chalk.yellow('Please ensure your project is set up with:\n'));
    console.log(chalk.cyan(`cd ${repoPath}`));
    console.log(chalk.cyan('# Install dependencies'));
    console.log(chalk.cyan('# Compile contracts'));
    console.log(chalk.cyan('# Run tests to ensure they pass'));
    console.log(chalk.cyan('# Set up coverage tools'));
  }

  console.log(chalk.bold('\n✅ Requirements:'));
  console.log('  • All dependencies installed');
  console.log('  • All contracts compile successfully');
  console.log('  • All existing tests pass');
  console.log('  • Coverage analysis tools working');

  console.log(chalk.bold('\n🎯 What this tool will do:'));
  console.log('  • Analyze current test coverage');
  console.log('  • Identify uncovered code (lines, functions, branches)');
  console.log('  • Generate AI-powered tests to increase coverage');
  console.log('  • Prioritize high-impact coverage improvements');
}

async function waitForUserConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(chalk.bold('\n❓ Is your project ready for coverage analysis?'));
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

async function saveCoverageSummary(summary: string, outputDir: string): Promise<void> {
  const summaryPath = path.join(outputDir, 'coverage-analysis-summary.md');
  await fs.writeFile(summaryPath, summary);
  console.log(chalk.green(`  ✓ Saved coverage analysis report`));
}

async function isProjectSetup(projectPath: string): Promise<boolean> {
  // Check if project appears to be already set up
  try {
    // Check for common build artifacts
    const foundryOut = path.join(projectPath, 'out');
    const hardhatArtifacts = path.join(projectPath, 'artifacts');
    const nodeModules = path.join(projectPath, 'node_modules');
    
    const foundryExists = await fs.access(foundryOut).then(() => true).catch(() => false);
    const hardhatExists = await fs.access(hardhatArtifacts).then(() => true).catch(() => false);
    const nodeModulesExists = await fs.access(nodeModules).then(() => true).catch(() => false);
    
    return foundryExists || (hardhatExists && nodeModulesExists);
  } catch {
    return false;
  }
} 