import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { MutationResult, GeneratedTest, TestGap } from '../types';

export class AIService {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4-turbo-preview') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async analyzeGaps(
    survivedMutations: MutationResult[],
    projectPath: string
  ): Promise<TestGap[]> {
    const spinner = ora('Analyzing test gaps...').start();
    const gaps: TestGap[] = [];

    try {
      for (const mutation of survivedMutations) {
        // Read the source file context
        const filePath = path.join(projectPath, mutation.file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const lines = fileContent.split('\n');
        
        // Get context around the mutation (5 lines before and after)
        const startLine = Math.max(0, mutation.line - 6);
        const endLine = Math.min(lines.length - 1, mutation.line + 4);
        const context = lines.slice(startLine, endLine + 1).join('\n');

        gaps.push({
          mutationResult: mutation,
          context
        });
      }

      spinner.succeed(chalk.green(`Analyzed ${gaps.length} test gaps`));
      return gaps;
    } catch (error) {
      spinner.fail(chalk.red('Failed to analyze test gaps'));
      throw error;
    }
  }

  async generateTests(
    gaps: TestGap[],
    projectPath: string
  ): Promise<GeneratedTest[]> {
    const spinner = ora('Generating Forge tests with AI...').start();
    const generatedTests: GeneratedTest[] = [];

    try {
      // Group mutations by file for more efficient test generation
      const mutationsByFile = new Map<string, TestGap[]>();
      for (const gap of gaps) {
        const file = gap.mutationResult.file;
        if (!mutationsByFile.has(file)) {
          mutationsByFile.set(file, []);
        }
        mutationsByFile.get(file)!.push(gap);
      }

      // Generate tests for each file
      for (const [file, fileGaps] of mutationsByFile) {
        spinner.text = `Generating tests for ${file}...`;
        
        const prompt = this.buildTestGenerationPrompt(fileGaps, file);
        
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert Solidity developer specializing in writing comprehensive Forge tests. 
Your task is to generate test cases that will catch the survived mutations from mutation testing.
Each test should be well-documented with comments explaining what mutation it targets.
Use Forge test conventions and best practices.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 4000
        });

        const generatedContent = response.choices[0].message.content || '';
        
        // Parse the generated test
        const testFileName = this.generateTestFileName(file);
        generatedTests.push({
          fileName: testFileName,
          content: generatedContent,
          description: `Tests targeting ${fileGaps.length} survived mutations in ${file}`,
          targetedMutations: fileGaps.map(g => g.mutationResult)
        });
      }

      spinner.succeed(chalk.green(`Generated ${generatedTests.length} test files`));
      return generatedTests;
    } catch (error) {
      spinner.fail(chalk.red('Failed to generate tests'));
      throw error;
    }
  }

  private buildTestGenerationPrompt(gaps: TestGap[], fileName: string): string {
    let prompt = `Generate Forge tests for the following survived mutations in ${fileName}:\n\n`;

    gaps.forEach((gap, index) => {
      const { mutationResult, context } = gap;
      prompt += `Mutation ${index + 1}:\n`;
      prompt += `Type: ${mutationResult.mutationType}\n`;
      prompt += `Line: ${mutationResult.line}\n`;
      prompt += `Original: ${mutationResult.original}\n`;
      prompt += `Mutated: ${mutationResult.mutated}\n`;
      prompt += `Context:\n\`\`\`solidity\n${context}\n\`\`\`\n\n`;
    });

    prompt += `\nGenerate comprehensive Forge tests that will catch these mutations. 
Each test should:
1. Have a descriptive name indicating what it tests
2. Include a comment explaining which mutation it targets
3. Use appropriate assertions to ensure the mutation would be caught
4. Follow Forge testing best practices
5. Be ready to run without modification

Return only the Solidity test contract code, starting with the pragma statement.`;

    return prompt;
  }

  private generateTestFileName(sourceFile: string): string {
    const baseName = path.basename(sourceFile, '.sol');
    return `${baseName}.mutation.t.sol`;
  }

  async generateSummary(
    mutationResults: MutationResult[],
    generatedTests: GeneratedTest[]
  ): Promise<string> {
    const spinner = ora('Generating summary report...').start();

    try {
      const totalMutations = mutationResults.length;
      const killedMutations = mutationResults.filter(r => r.status === 'killed').length;
      const survivedMutations = mutationResults.filter(r => r.status === 'survived').length;
      const mutationScore = totalMutations > 0 ? (killedMutations / totalMutations) * 100 : 0;

      const prompt = `Generate a comprehensive summary report for the following mutation testing results:

Total Mutations: ${totalMutations}
Killed Mutations: ${killedMutations}
Survived Mutations: ${survivedMutations}
Mutation Score: ${mutationScore.toFixed(2)}%

Generated ${generatedTests.length} test files to cover the gaps.

Survived mutations by type:
${this.groupMutationsByType(mutationResults.filter(r => r.status === 'survived'))}

Please provide:
1. An executive summary of the mutation testing results
2. Key findings about the test coverage gaps
3. Recommendations for improving test quality
4. Brief explanation of what each generated test file addresses

Format the response in markdown.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in mutation testing and test quality analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 2000
      });

      spinner.succeed(chalk.green('Summary report generated'));
      return response.choices[0].message.content || 'Failed to generate summary';
    } catch (error) {
      spinner.fail(chalk.red('Failed to generate summary'));
      throw error;
    }
  }

  private groupMutationsByType(mutations: MutationResult[]): string {
    const groups = new Map<string, number>();
    
    for (const mutation of mutations) {
      const count = groups.get(mutation.mutationType) || 0;
      groups.set(mutation.mutationType, count + 1);
    }

    return Array.from(groups.entries())
      .map(([type, count]) => `- ${type}: ${count}`)
      .join('\n');
  }

  // Coverage analysis methods
  async generateCoverageTests(
    prioritizedUncovered: any,
    projectPath: string
  ): Promise<GeneratedTest[]> {
    const spinner = ora('Generating AI-powered coverage tests...').start();
    const generatedTests: GeneratedTest[] = [];

    try {
      // Read some source files for context
      const sourceFiles = await this.getSourceFilesForContext(projectPath, prioritizedUncovered.files || []);
      
      // Group uncovered items by file
      const uncoveredByFile = new Map<string, any>();
      
      // Group uncovered lines by file
      for (const line of prioritizedUncovered.lines || []) {
        if (!uncoveredByFile.has(line.file)) {
          uncoveredByFile.set(line.file, { lines: [], functions: [], branches: [] });
        }
        uncoveredByFile.get(line.file)!.lines.push(line);
      }
      
      // Group uncovered functions by file
      for (const func of prioritizedUncovered.functions || []) {
        if (!uncoveredByFile.has(func.file)) {
          uncoveredByFile.set(func.file, { lines: [], functions: [], branches: [] });
        }
        uncoveredByFile.get(func.file)!.functions.push(func);
      }
      
      // Group uncovered branches by file
      for (const branch of prioritizedUncovered.branches || []) {
        if (!uncoveredByFile.has(branch.file)) {
          uncoveredByFile.set(branch.file, { lines: [], functions: [], branches: [] });
        }
        uncoveredByFile.get(branch.file)!.branches.push(branch);
      }

      // Generate tests for each file with uncovered code
      for (const [file, uncovered] of uncoveredByFile) {
        spinner.text = `Generating coverage tests for ${file}...`;
        
        const sourceCode = sourceFiles.get(file) || '';
        const prompt = this.buildCoverageTestPrompt(file, uncovered, sourceCode);
        
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert Solidity developer specializing in writing comprehensive test coverage.
Your task is to generate Forge tests that specifically target uncovered code paths.
Focus on:
1. Executing uncovered lines of code
2. Calling uncovered functions with various parameters
3. Testing both true and false branches of conditionals
4. Edge cases and boundary conditions
5. Error conditions that may be uncovered

Write tests that are realistic and follow Solidity best practices.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.4,
          max_tokens: 3000
        });

        const generatedContent = response.choices[0].message.content || '';
        
        const testFileName = this.generateCoverageTestFileName(file);
        generatedTests.push({
          fileName: testFileName,
          content: generatedContent,
          description: `Coverage tests for ${file} targeting ${uncovered.lines.length} lines, ${uncovered.functions.length} functions, ${uncovered.branches.length} branches`,
          targetedMutations: [] // Not applicable for coverage tests
        });
      }

      spinner.succeed(chalk.green(`Generated ${generatedTests.length} coverage test files`));
      return generatedTests;
    } catch (error) {
      spinner.fail(chalk.red('Failed to generate coverage tests'));
      throw error;
    }
  }

  async generateCoverageSummary(
    coverageReport: any,
    generatedTests: GeneratedTest[],
    targetCoverage: number
  ): Promise<string> {
    const spinner = ora('Generating coverage analysis summary...').start();

    try {
      const coverageGap = targetCoverage - coverageReport.overallCoverage;
      
      const prompt = `Generate a comprehensive coverage analysis summary for the following data:

Current Coverage: ${coverageReport.overallCoverage.toFixed(2)}%
Target Coverage: ${targetCoverage}%
Coverage Gap: ${coverageGap.toFixed(2)}%

Uncovered Code:
- Lines: ${coverageReport.uncoveredLines?.length || 0}
- Functions: ${coverageReport.uncoveredFunctions?.length || 0}
- Branches: ${coverageReport.uncoveredBranches?.length || 0}

Generated Tests: ${generatedTests.length} files

High Priority Uncovered Areas:
${this.formatUncoveredAreas(coverageReport)}

Please provide:
1. Executive summary of current test coverage status
2. Analysis of the most critical gaps (what important code is untested)
3. Impact assessment of the uncovered code
4. Strategy recommendations for reaching target coverage
5. Brief overview of the generated tests and their purpose
6. Recommended next steps for the development team

Format the response in markdown with clear sections.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a senior test engineer and code quality expert specializing in test coverage analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 2500
      });

      spinner.succeed(chalk.green('Coverage summary generated'));
      return response.choices[0].message.content || 'Failed to generate coverage summary';
    } catch (error) {
      spinner.fail(chalk.red('Failed to generate coverage summary'));
      throw error;
    }
  }

  private async getSourceFilesForContext(projectPath: string, files: string[]): Promise<Map<string, string>> {
    const sourceFiles = new Map<string, string>();
    
    for (const file of files.slice(0, 10)) { // Limit to first 5 files to avoid token limits
      try {
        const filePath = path.join(projectPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        sourceFiles.set(file, content);
      } catch (error) {
        // File doesn't exist or can't be read, skip it
      }
    }
    
    return sourceFiles;
  }

  private buildCoverageTestPrompt(file: string, uncovered: any, sourceCode: string): string {
    let prompt = `Generate comprehensive Forge tests to increase coverage for ${file}.\n\n`;
    
    if (sourceCode) {
      prompt += `Source code context:\n\`\`\`solidity\n${sourceCode.substring(0, 2000)}\n\`\`\`\n\n`;
    }
    
    if (uncovered.functions && uncovered.functions.length > 0) {
      prompt += `Uncovered Functions to Test:\n`;
      uncovered.functions.forEach((func: any, index: number) => {
        prompt += `${index + 1}. ${func.functionName} (line ${func.lineNumber})\n`;
        prompt += `   Signature: ${func.signature}\n`;
        prompt += `   Priority: ${func.importance}\n\n`;
      });
    }
    
    if (uncovered.lines && uncovered.lines.length > 0) {
      prompt += `High Priority Uncovered Lines:\n`;
      uncovered.lines.slice(0, 10).forEach((line: any, index: number) => {
        prompt += `${index + 1}. Line ${line.lineNumber}: ${line.code}\n`;
        prompt += `   Priority: ${line.importance}\n\n`;
      });
    }
    
    if (uncovered.branches && uncovered.branches.length > 0) {
      prompt += `Uncovered Branches to Test:\n`;
      uncovered.branches.slice(0, 5).forEach((branch: any, index: number) => {
        prompt += `${index + 1}. ${branch.branchType} condition at line ${branch.lineNumber}\n`;
        prompt += `   Condition: ${branch.condition}\n`;
        prompt += `   Priority: ${branch.importance}\n\n`;
      });
    }
    
    prompt += `\nGenerate a comprehensive Forge test contract that:
1. Tests all uncovered functions with various input parameters
2. Executes uncovered lines through realistic scenarios
3. Tests both true and false paths of uncovered branches
4. Includes edge cases and error conditions
5. Uses appropriate setup, assertions, and test patterns
6. Follows Forge testing conventions

Return only the complete Solidity test contract, starting with the pragma statement.
Include descriptive comments explaining what each test covers.`;

    return prompt;
  }

  private generateCoverageTestFileName(sourceFile: string): string {
    const baseName = path.basename(sourceFile, '.sol');
    return `${baseName}.coverage.t.sol`;
  }

  private formatUncoveredAreas(coverageReport: any): string {
    let result = '';
    
    if (coverageReport.uncoveredFunctions && coverageReport.uncoveredFunctions.length > 0) {
      result += 'Top Uncovered Functions:\n';
      coverageReport.uncoveredFunctions.slice(0, 5).forEach((func: any, index: number) => {
        result += `- ${func.functionName} in ${func.file} (${func.importance} priority)\n`;
      });
      result += '\n';
    }
    
    if (coverageReport.uncoveredLines && coverageReport.uncoveredLines.length > 0) {
      result += 'High Priority Uncovered Lines:\n';
      coverageReport.uncoveredLines.filter((line: any) => line.importance === 'high').slice(0, 5).forEach((line: any, index: number) => {
        result += `- Line ${line.lineNumber} in ${line.file}: ${line.code.substring(0, 50)}...\n`;
      });
    }
    
    return result || 'No specific uncovered areas to highlight.';
  }
} 