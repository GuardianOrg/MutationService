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
} 