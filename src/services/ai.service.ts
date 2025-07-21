import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { MutationResult, GeneratedTest, TestGap } from '../types';

export class AIService {
  private openai: OpenAI | null;
  private model: string;
  private hasApiKey: boolean;

  constructor(apiKey?: string, model: string = 'gpt-4-turbo-preview') {
    this.hasApiKey = !!apiKey;
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = model;
  }

  async analyzeGaps(
    survivedMutations: MutationResult[],
    projectPath: string
  ): Promise<TestGap[]> {
    if (!this.hasApiKey) {
      console.log(chalk.yellow('\n⚠️  Skipping gap analysis (no OpenAI API key provided)'));
      return [];
    }

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
    if (!this.hasApiKey) {
      console.log(chalk.yellow('\n⚠️  Skipping test generation (no OpenAI API key provided)'));
      return [];
    }

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
        
        // Read the actual source file to understand the contract
        const filePath = path.join(projectPath, file);
        const sourceCode = await fs.readFile(filePath, 'utf-8');
        
        // Try to find existing test files for this contract to understand patterns
        const contractName = path.basename(file, '.sol');
        const existingTestExample = await this.findExistingTestExample(projectPath, contractName);
        
        const prompt = this.buildTestGenerationPrompt(fileGaps, file, sourceCode, existingTestExample);
        
        const response = await this.openai!.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert Solidity developer specializing in writing Forge tests.
CRITICAL REQUIREMENTS:
1. Generate ONLY valid Solidity code - no markdown, no triple backticks, no explanations
2. The code must compile and run with 'forge test' without any modifications
3. Import the contract being tested correctly
4. Use proper Forge test patterns (setUp, test functions, assertions)
5. Handle contract deployment and initialization properly
6. Use only public/external functions - never call internal functions
7. Include all necessary imports at the top
8. Start with pragma solidity statement
9. The output should be a complete, compilable .sol file`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 4000
        });

        let generatedContent = response.choices[0].message.content || '';
        
        // Clean up any markdown formatting if the AI added it despite instructions
        generatedContent = this.cleanGeneratedCode(generatedContent);
        
        // Validate that it looks like valid Solidity
        if (!this.isValidSolidity(generatedContent)) {
          console.warn(chalk.yellow(`Generated test for ${file} may have issues - please review`));
        }
        
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

  private async findExistingTestExample(projectPath: string, contractName: string): Promise<string | null> {
    // Look for existing test files to understand the project's test patterns
    const possibleTestPaths = [
      `test/${contractName}.t.sol`,
      `test/${contractName}Test.sol`,
      `test/${contractName}.test.sol`,
      `tests/${contractName}.t.sol`,
      `test/unit/${contractName}.t.sol`,
    ];
    
    for (const testPath of possibleTestPaths) {
      try {
        const fullPath = path.join(projectPath, testPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        // Return first 50 lines as example
        return content.split('\n').slice(0, 50).join('\n');
      } catch {
        // File doesn't exist, try next
      }
    }
    
    // Try to find any test file as example
    try {
      const testFiles = await fs.readdir(path.join(projectPath, 'test'));
      const solidityTest = testFiles.find(f => f.endsWith('.t.sol') || f.endsWith('.test.sol'));
      if (solidityTest) {
        const content = await fs.readFile(path.join(projectPath, 'test', solidityTest), 'utf-8');
        return content.split('\n').slice(0, 50).join('\n');
      }
    } catch {
      // No test directory or can't read
    }
    
    return null;
  }

  private cleanGeneratedCode(code: string): string {
    // Remove markdown code blocks if present
    code = code.replace(/```solidity\s*\n?/g, '');
    code = code.replace(/```\s*$/g, '');
    code = code.trim();
    
    // Remove any explanatory text before pragma
    const pragmaIndex = code.indexOf('pragma solidity');
    if (pragmaIndex > 0) {
      code = code.substring(pragmaIndex);
    }
    
    return code;
  }

  private isValidSolidity(code: string): boolean {
    // Basic validation that this looks like Solidity code
    return code.includes('pragma solidity') && 
           code.includes('contract') && 
           (code.includes('function test') || code.includes('function testFuzz'));
  }

  private buildTestGenerationPrompt(
    gaps: TestGap[], 
    fileName: string,
    sourceCode: string,
    existingTestExample: string | null
  ): string {
    // Extract contract name and understand structure
    const contractMatch = sourceCode.match(/contract\s+(\w+)/);
    const contractName = contractMatch ? contractMatch[1] : path.basename(fileName, '.sol');
    
    // Extract imports from source
    const imports = sourceCode.match(/import\s+.*?;/g) || [];
    
    let prompt = `Generate a complete, compilable Forge test contract for ${contractName}.\n\n`;
    
    prompt += `Source contract to test:\n${sourceCode.substring(0, 3000)}\n\n`;
    
    if (existingTestExample) {
      prompt += `Example of existing test pattern in this project:\n${existingTestExample}\n\n`;
    }
    
    prompt += `The test must catch these survived mutations:\n\n`;

    gaps.forEach((gap, index) => {
      const { mutationResult } = gap;
      prompt += `Mutation ${index + 1}:\n`;
      prompt += `Type: ${mutationResult.mutationType}\n`;
      prompt += `Line: ${mutationResult.line}\n`;
      prompt += `Original: ${mutationResult.original}\n`;
      prompt += `Mutated: ${mutationResult.mutated}\n\n`;
    });

    prompt += `\nREQUIREMENTS:
1. Generate ONLY the Solidity code - no markdown, no explanations
2. Include all necessary imports (the contract being tested, Test.sol, console.sol, etc)
3. Use the same import paths as the source contract
4. Create a test contract that extends Test
5. Include setUp() function to deploy and initialize contracts
6. Write specific test functions that would fail if the mutations were present
7. Use descriptive test function names (e.g., test_RevertWhen_SlippageTooHigh)
8. Only call public/external functions - never internal ones
9. Use proper assertions (assertEq, assertTrue, vm.expectRevert, etc.)
10. The test must compile and run with 'forge test' without modifications

Generate the complete test contract now:`;

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
    if (!this.hasApiKey) {
      console.log(chalk.yellow('\n⚠️  Skipping summary generation (no OpenAI API key provided)'));
      return 'Skipped summary generation due to missing API key.';
    }

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
2. Key findings about the test quality gaps
3. Recommendations for improving test quality
4. Brief explanation of what each generated test file addresses

Format the response in markdown.`;

      const response = await this.openai!.chat.completions.create({
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