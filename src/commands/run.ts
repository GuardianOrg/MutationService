import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { GitService } from '../services/git.service';
import { GambitService } from '../services/gambit.service';
import { RunOptions, MutationResult, GeneratedTest, MutationSession, MutationIteration } from '../types';
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
  if (score >= 80) return 'Grade: B - Good test quality with room for improvement in critical areas.';
  if (score >= 70) return 'Grade: C - Moderate test quality. Focus on security and edge case testing.';
  if (score >= 60) return 'Grade: D - Below average. Significant gaps in test quality detected.';
  if (score >= 50) return 'Grade: F - Poor test quality. Consider adopting Test-Driven Development.';
  return 'Grade: F - Critical issues detected. Immediate attention required for production readiness.';
}

// Helper function to save mutation session data
async function saveMutationSession(session: MutationSession, outputDir: string): Promise<void> {
  const sessionPath = path.join(outputDir, 'mutation-session.json');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
  console.log(chalk.dim(`  Session data saved to: ${sessionPath}`));
}

// Helper function to save mutation results for current iteration
async function saveMutationResults(
  mutationResults: MutationResult[], 
  outputDir: string, 
  iterationNumber?: number
): Promise<void> {
  const filename = iterationNumber 
    ? `mutation-results-iteration-${iterationNumber}.json`
    : 'mutation-results.json';
  const resultsPath = path.join(outputDir, filename);
  
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(resultsPath, JSON.stringify(mutationResults, null, 2));
  console.log(chalk.dim(`  Mutation results saved to: ${resultsPath}`));
}

export async function runMutationTest(options: RunOptions): Promise<void> {
  console.log(chalk.bold.blue('\n🧬 Forge Testing Suite - Mutation Testing\n'));
  
  const gitService = new GitService();
  const gambitService = new GambitService();
  const aiService = new AIService(options.openaiKey, options.model);
  
  let repoPath: string | null = null;
  let isLocalMode = false;
  
  // Initialize mutation session
  const session: MutationSession = {
    sessionId: `session-${Date.now()}`,
    timestamp: new Date().toISOString(),
    projectPath: '',
    config: {
      repository: options.localPath ? { local_path: options.localPath } : { url: options.repo },
      openai: options.openaiKey ? { api_key: options.openaiKey, model: options.model } : undefined,
      output: { directory: options.output, cleanup: options.cleanup },
      testing: { iterative: options.iterative }
    },
    iterations: [],
    summary: {
      totalMutations: 0,
      killedMutations: 0,
      survivedMutations: 0,
      mutationScore: 0,
      gaps: [],
      generatedTests: []
    }
  };

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
      const tempDir = path.join(process.cwd(), '.mutation-testing-temp');
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
      await displaySetupInstructions(repoPath);
      
      const isReady = await waitForUserConfirmation();
      if (!isReady) {
        console.log(chalk.yellow('\n⏸️  Setup cancelled. Please run the command again when your project is ready.'));
        return;
      }
    } else {
      console.log(chalk.bold('\n✅ Step 2: Project already set up'));
    }

    // Enable iterative mode
    if (options.iterative) {
      await runIterativeMutationTesting(repoPath, options, gambitService, aiService);
    } else {
      await runSingleMutationTest(repoPath, options, gambitService, aiService, session);
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error);
    throw error;
  } finally {
    // Cleanup only if:
    // 1. Not in local mode (never cleanup local directories)
    // 2. Not in iterative mode (users need the repo between iterations)
    // 3. Cleanup is enabled
    if (repoPath && !isLocalMode && !options.iterative && options.cleanup) {
      console.log(chalk.dim('\nCleaning up...'));
      await gitService.cleanup(repoPath);
    }
  }
}

async function isProjectSetup(projectPath: string): Promise<boolean> {
  // Check if the project has been built
  const foundryOut = path.join(projectPath, 'out');
  const nodeModules = path.join(projectPath, 'node_modules');
  
  const foundryExists = await fs.access(foundryOut).then(() => true).catch(() => false);
  const nodeModulesExists = await fs.access(nodeModules).then(() => true).catch(() => false);
  
  return foundryExists;
}

async function runSingleMutationTest(
  repoPath: string,
  options: RunOptions,
  gambitService: GambitService,
  aiService: AIService,
  session: MutationSession
): Promise<MutationSession> {
  // Step 3: Setup and run mutation testing
  console.log(chalk.bold('\nStep 3: Setting up and running mutation tests...'));
  await gambitService.setupGambitConfigWithoutDependencies(repoPath);
  const mutationResults = await gambitService.runMutationTestingWithoutSetup(repoPath, options.numMutants);
  
  // Add timestamp to results
  const timestampedResults = mutationResults.map(r => ({
    ...r,
    timestamp: new Date().toISOString()
  }));
  
  // Save mutation results immediately
  await saveMutationResults(timestampedResults, options.output);
  
  // Step 4: Analyze mutation testing results
  console.log(chalk.bold('\nStep 4: Analyzing mutation testing results...'));
  
  const mutationAnalysisResult = await gambitService.generateMutationAnalysis(mutationResults, repoPath);
  const { guardianScore, analysis, reportMarkdown } = mutationAnalysisResult;
  
  displayMutationResults(analysis, guardianScore);
  
  if (analysis.summary.survivedMutants === 0) {
    console.log(chalk.green('\n✅ Excellent! All mutations were killed. Your test suite is comprehensive!'));
    console.log(chalk.green('No gaps detected in your test quality.'));
    
    // Save the analysis report even for perfect scores
    await saveMutationAnalysis(reportMarkdown, options.output);
    
    // Update session
    const iteration: MutationIteration = {
      iterationNumber: 1,
      timestamp: new Date().toISOString(),
      mutationResults: timestampedResults,
      generatedTests: [],
      stats: {
        total: analysis.summary.totalMutations,
        killed: analysis.summary.killedMutations,
        survived: 0,
        timeout: timestampedResults.filter(r => r.status === 'timeout').length,
        error: timestampedResults.filter(r => r.status === 'error').length
      }
    };
    
    session.iterations.push(iteration);
    session.summary = analysis.summary;
    await saveMutationSession(session, options.output);
    
    return session;
  }
  
  const survivedMutationResults = mutationResults.filter(r => r.status === 'survived');
  console.log(chalk.yellow(`\n⚠️  Found ${analysis.summary.survivedMutants} survived mutations indicating gaps in test quality`));
  
  // Step 5: Generate tests for gaps (only if API key provided)
  let generatedTests: GeneratedTest[] = [];
  if (options.openaiKey) {
    console.log(chalk.bold('\nStep 5: Generating tests to cover gaps...'));
    const gaps = await aiService.analyzeGaps(survivedMutationResults, repoPath);
    generatedTests = await aiService.generateTests(gaps, repoPath);
    
    // Step 6: Save generated tests
    console.log(chalk.bold('\nStep 6: Saving generated tests...'));
    await saveGeneratedTests(generatedTests, options.output);
  } else {
    console.log(chalk.yellow('\n⚠️  Skipping test generation (no OpenAI API key provided)'));
    console.log(chalk.dim('  To generate tests, add your OpenAI API key to the configuration.'));
  }
  
  // Step 7: Save mutation analysis report
  console.log(chalk.bold('\nStep 7: Saving mutation analysis report...'));
  await saveMutationAnalysis(reportMarkdown, options.output);
  
  // Step 8: Generate summary report
  if (options.openaiKey) {
    console.log(chalk.bold('\nStep 8: Generating summary report...'));
    const summaryReport = await aiService.generateSummary(timestampedResults, generatedTests);
    await saveSummary(summaryReport, options.output);
  }
  
  // Update session
  const iteration: MutationIteration = {
    iterationNumber: 1,
    timestamp: new Date().toISOString(),
    mutationResults: timestampedResults,
    generatedTests,
    stats: {
      total: analysis.summary.totalMutations,
      killed: analysis.summary.killedMutations,
      survived: analysis.summary.survivedMutations,
      timeout: timestampedResults.filter(r => r.status === 'timeout').length,
      error: timestampedResults.filter(r => r.status === 'error').length
    }
  };
  
  session.iterations.push(iteration);
  session.summary = analysis.summary;
  await saveMutationSession(session, options.output);
  
  displayFinalResults(analysis, guardianScore, generatedTests.length, options.output);
  
  return session;
}

async function runIterativeMutationTesting(
  repoPath: string,
  options: RunOptions,
  gambitService: GambitService,
  aiService: AIService
): Promise<void> {
  console.log(chalk.bold.cyan('\n🔄 Iterative Mutation Testing Mode Enabled\n'));
  
  let iteration = 1;
  let previousSurvivedCount = Infinity;
  let consecutiveNoImprovement = 0;
  let allMutationResults: MutationResult[] = [];
  let previousSurvivedMutations: MutationResult[] = [];
  
  while (true) {
    console.log(chalk.bold.blue(`\n━━━ Iteration ${iteration} ━━━\n`));
    
    // Run mutation testing
    console.log(chalk.bold(`Running mutation tests (iteration ${iteration})...`));
    await gambitService.setupGambitConfigWithoutDependencies(repoPath);
    
    // For first iteration, run full test. For subsequent, we could optimize to only test survived
    const mutationResults = iteration === 1 
      ? await gambitService.runMutationTestingWithoutSetup(repoPath, options.numMutants)
      : await gambitService.retestSurvivedMutations(repoPath, allMutationResults);
    
    // Store results for next iteration
    allMutationResults = mutationResults;
    
    // Analyze results
    const mutationAnalysisResult = await gambitService.generateMutationAnalysis(mutationResults, repoPath);
    const { guardianScore, analysis, reportMarkdown } = mutationAnalysisResult;
    
    // Display results
    displayMutationResults(analysis, guardianScore);
    
    const survivedMutations = mutationResults.filter(r => r.status === 'survived');
    const survivedCount = survivedMutations.length;
    
    // Check if we've reached perfection
    if (survivedCount === 0) {
      console.log(chalk.green('\n🎉 Perfect! All mutations have been killed!'));
                console.log(chalk.green('Your test suite now provides comprehensive quality assurance.'));
      
      await saveMutationAnalysis(reportMarkdown, options.output);
      displayFinalResults(analysis, guardianScore, 0, options.output); // No generated tests in iterative mode
      break;
    }
    
    // Check for improvement and show which mutations were killed
    if (iteration > 1) {
      const newlyKilledMutations = previousSurvivedMutations.filter(prev => 
        !survivedMutations.some(curr => 
          curr.file === prev.file && 
          curr.line === prev.line && 
          curr.mutationType === prev.mutationType
        )
      );
      
      const improvement = previousSurvivedCount - survivedCount;
      if (improvement > 0) {
        console.log(chalk.green(`\n✅ Progress! Killed ${improvement} more mutations since last iteration.`));
        
        if (newlyKilledMutations.length > 0) {
          console.log(chalk.green('\n🎯 Newly killed mutations:'));
          newlyKilledMutations.forEach((m, idx) => {
            console.log(chalk.green(`  ${idx + 1}. ${m.file}:${m.line} - ${m.mutationType}`));
            console.log(chalk.green(`     "${m.original}" → "${m.mutated}"`));
          });
        }
        
        consecutiveNoImprovement = 0;
      } else if (improvement === 0) {
        consecutiveNoImprovement++;
        console.log(chalk.yellow(`\n⚠️  No improvement in this iteration (${consecutiveNoImprovement} consecutive).`));
        
        if (consecutiveNoImprovement >= 3) {
          console.log(chalk.yellow('\n⚠️  No improvement for 3 consecutive iterations.'));
          const shouldContinue = await askToContinue('Do you want to continue iterating?');
          if (!shouldContinue) {
            break;
          }
          consecutiveNoImprovement = 0;
        }
      }
    }
    
    previousSurvivedCount = survivedCount;
    previousSurvivedMutations = [...survivedMutations];
    
    // Generate new tests for remaining gaps
    console.log(chalk.bold(`\nGenerating tests for ${survivedCount} remaining mutations...`));
    
    const gaps = await aiService.analyzeGaps(survivedMutations, repoPath);
    const generatedTests = await aiService.generateTests(gaps, repoPath);
    
    // Save generated tests with iteration suffix
    const iterationOutput = path.join(options.output, `iteration-${iteration}`);
    await saveGeneratedTests(generatedTests, iterationOutput);
    
    // Save reports for this iteration
    await saveMutationAnalysis(reportMarkdown, iterationOutput);
    const summary = await aiService.generateSummary(mutationResults, generatedTests);
    await saveSummary(summary, iterationOutput);
    
    console.log(chalk.cyan(`\n📁 Generated tests saved to: ${iterationOutput}`));
    
    // Show remaining mutations summary
    console.log(chalk.yellow('\n📋 Remaining mutations to kill:'));
    const mutationsByFile = survivedMutations.reduce((acc: any, m) => {
      if (!acc[m.file]) acc[m.file] = [];
      acc[m.file].push(m);
      return acc;
    }, {});
    
    Object.entries(mutationsByFile).forEach(([file, mutations]: [string, any]) => {
      console.log(chalk.yellow(`  ${file}: ${mutations.length} mutations`));
    });
    
    console.log(chalk.yellow('\n📝 Next steps:'));
    console.log(chalk.yellow('1. Review the generated tests in the output directory'));
    console.log(chalk.yellow('2. Add the relevant tests to your test suite'));
    console.log(chalk.yellow('3. Run your test suite to ensure all tests pass'));
    console.log(chalk.yellow('4. Press Enter to continue with the next iteration'));
    
    // Wait for user to add tests and continue
    const shouldContinue = await waitForIterationContinue();
    if (!shouldContinue) {
      console.log(chalk.yellow('\n⏸️  Iterative testing stopped by user.'));
      break;
    }
    
    iteration++;
  }
  
  console.log(chalk.bold.green(`\n✅ Iterative mutation testing completed after ${iteration} iteration(s)!\n`));
}

async function waitForIterationContinue(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(chalk.bold('\n❓ Have you added the generated tests to your test suite?'));
    rl.question(chalk.cyan('Press Enter to continue with next iteration, or type "stop" to finish: '), (answer) => {
      rl.close();
      const normalizedAnswer = answer.toLowerCase().trim();
      resolve(normalizedAnswer !== 'stop' && normalizedAnswer !== 'quit' && normalizedAnswer !== 'exit');
    });
  });
}

async function askToContinue(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.cyan(`${question} (yes/no): `), (answer) => {
      rl.close();
      const normalizedAnswer = answer.toLowerCase().trim();
      resolve(normalizedAnswer === 'yes' || normalizedAnswer === 'y');
    });
  });
}

function displayMutationResults(analysis: any, guardianScore: number): void {
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
}

function displayFinalResults(analysis: any, guardianScore: number, generatedTestsCount: number, outputDir: string): void {
  console.log(chalk.bold.green('\n✅ Mutation testing completed successfully!\n'));
  console.log(chalk.cyan('Results:'));
  console.log(`  • Guardian Mutation Score: ${guardianScore}/100 ${getScoreEmoji(guardianScore)}`);
  console.log(`  • Total mutations: ${analysis.summary.totalMutations}`);
  console.log(`  • Killed mutations: ${analysis.summary.killedMutations}`);
  console.log(`  • Survived mutations: ${analysis.summary.survivedMutations}`);
  console.log(`  • Basic mutation score: ${analysis.summary.mutationScore.toFixed(2)}%`);
  if (generatedTestsCount > 0) {
    console.log(`  • Generated test files: ${generatedTestsCount}`);
  }
  console.log(`\nOutput saved to: ${chalk.underline(outputDir)}`);
  console.log(chalk.dim('Detailed analysis: ') + chalk.underline(path.join(outputDir, 'guardian-mutation-analysis.md')));
  
  console.log(chalk.bold('\n💡 See the detailed analysis report for ' + analysis.recommendations.length + ' recommendations'));
}

async function displaySetupInstructions(repoPath: string): Promise<void> {
  console.log(chalk.cyan('\n📁 Repository cloned to:'), chalk.underline(repoPath));
  console.log(chalk.bold('\n🔧 Please complete the following setup steps:\n'));

  // Check project type
  const foundryTomlExists = await fs.access(path.join(repoPath, 'foundry.toml')).then(() => true).catch(() => false);
  
  if (foundryTomlExists) {
    console.log(chalk.green('🔨 Detected Forge/Foundry project\n'));
    console.log(chalk.cyan('cd ' + repoPath));
    console.log(chalk.cyan('forge install'));
    console.log(chalk.cyan('forge build'));
    console.log(chalk.cyan('forge test'));
  } else {
    console.log(chalk.yellow('⚠️  No foundry.toml detected\n'));
    console.log(chalk.dim('Make sure your project is compiled before proceeding.'));
    console.log(chalk.cyan('cd ' + repoPath));
    console.log(chalk.cyan('# Run your project\'s build command'));
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
  await fs.mkdir(outputDir, { recursive: true });
  const analysisPath = path.join(outputDir, 'guardian-mutation-analysis.md');
  await fs.writeFile(analysisPath, reportMarkdown);
  console.log(chalk.green(`  ✓ Saved mutation analysis report`));
} 