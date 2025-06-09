import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CoverageReport {
  overallCoverage: number;
  lineCoverage: number;
  functionCoverage: number;
  branchCoverage: number;
  uncoveredLines: UncoveredLine[];
  uncoveredFunctions: UncoveredFunction[];
  uncoveredBranches: UncoveredBranch[];
  fileReports: FileCoverageReport[];
}

export interface UncoveredLine {
  file: string;
  lineNumber: number;
  code: string;
  importance: 'high' | 'medium' | 'low';
}

export interface UncoveredFunction {
  file: string;
  functionName: string;
  lineNumber: number;
  signature: string;
  importance: 'high' | 'medium' | 'low';
}

export interface UncoveredBranch {
  file: string;
  lineNumber: number;
  condition: string;
  branchType: 'if' | 'for' | 'while' | 'require' | 'assert';
  importance: 'high' | 'medium' | 'low';
}

export interface FileCoverageReport {
  file: string;
  lineCoverage: number;
  functionCoverage: number;
  branchCoverage: number;
  totalLines: number;
  coveredLines: number;
  totalFunctions: number;
  coveredFunctions: number;
}

export interface PrioritizedUncovered {
  lines: UncoveredLine[];
  functions: UncoveredFunction[];
  branches: UncoveredBranch[];
  files: string[];
}

export class CoverageService {
  async analyzeCoverage(projectPath: string): Promise<CoverageReport> {
    console.log(chalk.dim('  Detecting project type...'));
    
    // Check if it's a Forge project
    const foundryTomlPath = path.join(projectPath, 'foundry.toml');
    const isForgeProject = await fs.access(foundryTomlPath).then(() => true).catch(() => false);
    
    if (isForgeProject) {
      return await this.analyzeForgeProjectCoverage(projectPath);
    } else {
      return await this.analyzeHardhatProjectCoverage(projectPath);
    }
  }

  private async analyzeForgeProjectCoverage(projectPath: string): Promise<CoverageReport> {
    console.log(chalk.dim('  Running forge coverage analysis...'));
    
    try {
      // Run forge coverage with LCOV output for detailed analysis
      const { stdout: coverageOutput } = await execAsync('forge coverage --report lcov --report summary', {
        cwd: projectPath,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        timeout: 120000 // 2 minutes
      });

      // Parse the summary output for overall coverage - try multiple formats
      let overallCoverage = 0;
      
      // Try different forge coverage output formats
      const patterns = [
        /Overall coverage: ([\d.]+)%/i,  // "Overall coverage: 85.5%"
        /Total.*?\|\s*([\d.]+)%/i,       // Table format "| Total | 85.5% |"
        /\|\s*Total\s*\|\s*([\d.]+)%/i,  // "| Total | 85.5% |" 
        /Lines:\s*([\d.]+)%/i,           // "Lines: 85.5%"
        /Statement coverage:\s*([\d.]+)%/i, // Statement coverage format
      ];
      
      for (const pattern of patterns) {
        const match = coverageOutput.match(pattern);
        if (match) {
          overallCoverage = parseFloat(match[1]);
          console.log(chalk.dim(`  Parsed coverage: ${overallCoverage}% using pattern: ${pattern.source}`));
          break;
        }
      }
      
      // If still 0, log the output for debugging
      if (overallCoverage === 0) {
        console.log(chalk.yellow('  Warning: Could not parse coverage percentage from output:'));
        console.log(chalk.dim(coverageOutput.substring(0, 500) + '...'));
        
        // Try to extract any percentage from the output as fallback
        const anyPercentage = coverageOutput.match(/([\d.]+)%/);
        if (anyPercentage) {
          overallCoverage = parseFloat(anyPercentage[1]);
          console.log(chalk.yellow(`  Using fallback percentage: ${overallCoverage}%`));
        }
      }

      // Read LCOV file for detailed analysis
      const lcovPath = path.join(projectPath, 'lcov.info');
      let lcovData = '';
      try {
        lcovData = await fs.readFile(lcovPath, 'utf-8');
      } catch {
        console.log(chalk.yellow('    Warning: LCOV file not found, using basic analysis'));
      }

      return await this.parseCoverageData(projectPath, coverageOutput, lcovData, overallCoverage);
    } catch (error: any) {
      throw new Error(`Failed to analyze Forge coverage: ${error.message}`);
    }
  }

  private async analyzeHardhatProjectCoverage(projectPath: string): Promise<CoverageReport> {
    console.log(chalk.dim('  Running Hardhat coverage analysis...'));
    
    try {
      // Run hardhat coverage
      const { stdout: coverageOutput } = await execAsync('npx hardhat coverage', {
        cwd: projectPath,
        maxBuffer: 1024 * 1024 * 10,
        timeout: 300000 // 5 minutes
      });

      // Parse coverage output
      const overallMatch = coverageOutput.match(/All files\s+\|\s+([\d.]+)/);
      const overallCoverage = overallMatch ? parseFloat(overallMatch[1]) : 0;

      // Read coverage JSON if available
      const coverageJsonPath = path.join(projectPath, 'coverage/coverage-final.json');
      let coverageJson = '';
      try {
        coverageJson = await fs.readFile(coverageJsonPath, 'utf-8');
      } catch {
        console.log(chalk.yellow('    Warning: Coverage JSON not found, using basic analysis'));
      }

      return await this.parseCoverageData(projectPath, coverageOutput, coverageJson, overallCoverage);
    } catch (error: any) {
      throw new Error(`Failed to analyze Hardhat coverage: ${error.message}`);
    }
  }

  private async parseCoverageData(
    projectPath: string, 
    coverageOutput: string, 
    additionalData: string, 
    overallCoverage: number
  ): Promise<CoverageReport> {
    console.log(chalk.dim('  Parsing coverage data and identifying gaps...'));
    
    // Find source files
    const sourceFiles = await this.findSourceFiles(projectPath);
    
    const uncoveredLines: UncoveredLine[] = [];
    const uncoveredFunctions: UncoveredFunction[] = [];
    const uncoveredBranches: UncoveredBranch[] = [];
    const fileReports: FileCoverageReport[] = [];

    // Parse LCOV data if available
    if (additionalData && additionalData.includes('TN:')) {
      const lcovReport = this.parseLCOVData(additionalData);
      
      // Process each source file
      for (const file of sourceFiles) {
        const fileReport = await this.analyzeFileForUncoveredCode(file, projectPath, lcovReport.get(file));
        fileReports.push(fileReport);
        
        // Add uncovered items from this file
        if (fileReport.uncoveredLines) uncoveredLines.push(...fileReport.uncoveredLines);
        if (fileReport.uncoveredFunctions) uncoveredFunctions.push(...fileReport.uncoveredFunctions);
        if (fileReport.uncoveredBranches) uncoveredBranches.push(...fileReport.uncoveredBranches);
      }
    } else {
      // Fallback to basic analysis
      for (const file of sourceFiles) {
        const fileReport = await this.analyzeFileForUncoveredCode(file, projectPath);
        fileReports.push(fileReport);
        
        if (fileReport.uncoveredLines) uncoveredLines.push(...fileReport.uncoveredLines);
        if (fileReport.uncoveredFunctions) uncoveredFunctions.push(...fileReport.uncoveredFunctions);
        if (fileReport.uncoveredBranches) uncoveredBranches.push(...fileReport.uncoveredBranches);
      }
    }

    return {
      overallCoverage,
      lineCoverage: this.calculateAverageLineCoverage(fileReports),
      functionCoverage: this.calculateAverageFunctionCoverage(fileReports),
      branchCoverage: this.calculateAverageBranchCoverage(fileReports),
      uncoveredLines,
      uncoveredFunctions,
      uncoveredBranches,
      fileReports
    };
  }

  private parseLCOVData(lcovData: string): Map<string, any> {
    const fileMap = new Map<string, any>();
    const sections = lcovData.split('TN:').slice(1); // Remove empty first element
    
    for (const section of sections) {
      const lines = section.trim().split('\n');
      let currentFile = '';
      const uncoveredLines: number[] = [];
      const uncoveredFunctions: string[] = [];
      
      for (const line of lines) {
        if (line.startsWith('SF:')) {
          currentFile = line.substring(3);
        } else if (line.startsWith('DA:')) {
          // DA:line_number,hit_count
          const [lineNum, hitCount] = line.substring(3).split(',');
          if (parseInt(hitCount) === 0) {
            uncoveredLines.push(parseInt(lineNum));
          }
        } else if (line.startsWith('FN:')) {
          // FN:line_number,function_name
          const [lineNum, funcName] = line.substring(3).split(',');
          uncoveredFunctions.push(funcName);
        }
      }
      
      if (currentFile) {
        fileMap.set(currentFile, { uncoveredLines, uncoveredFunctions });
      }
    }
    
    return fileMap;
  }

  private async findSourceFiles(projectPath: string): Promise<string[]> {
    const glob = require('glob');
    
    let sourceFiles: string[] = [];
    
    try {
      sourceFiles = glob.sync('src/**/*.sol', { cwd: projectPath });
      if (sourceFiles.length === 0) {
        sourceFiles = glob.sync('contracts/**/*.sol', { cwd: projectPath });
      }
    } catch {
      sourceFiles = [];
    }

    // Filter out test files
    return sourceFiles.filter(file => {
      const fileName = path.basename(file);
      const filePath = file.toLowerCase();
      
      return !(
        filePath.includes('/test/') ||
        filePath.includes('/tests/') ||
        fileName.endsWith('.test.sol') ||
        fileName.endsWith('.t.sol') ||
        fileName.startsWith('Test') ||
        fileName.endsWith('Test.sol') ||
        filePath.includes('mock') ||
        filePath.includes('Mock')
      );
    });
  }

  private async analyzeFileForUncoveredCode(
    file: string, 
    projectPath: string,
    lcovFileData?: any
  ): Promise<FileCoverageReport & { uncoveredLines?: UncoveredLine[], uncoveredFunctions?: UncoveredFunction[], uncoveredBranches?: UncoveredBranch[] }> {
    const filePath = path.join(projectPath, file);
    const sourceCode = await fs.readFile(filePath, 'utf-8');
    const lines = sourceCode.split('\n');
    
    const uncoveredLines: UncoveredLine[] = [];
    const uncoveredFunctions: UncoveredFunction[] = [];
    const uncoveredBranches: UncoveredBranch[] = [];

    // Use LCOV data if available
    if (lcovFileData) {
      // Process uncovered lines from LCOV
      for (const lineNum of lcovFileData.uncoveredLines || []) {
        if (lineNum <= lines.length) {
          const code = lines[lineNum - 1].trim();
          if (this.isExecutableLine(code)) {
            uncoveredLines.push({
              file,
              lineNumber: lineNum,
              code,
              importance: this.assessLineImportance(code)
            });
          }
        }
      }
      
      // Process uncovered functions from LCOV
      for (const funcName of lcovFileData.uncoveredFunctions || []) {
        // Find the function in the source code
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(`function ${funcName}`) && !line.includes('//')) {
            uncoveredFunctions.push({
              file,
              functionName: funcName,
              lineNumber: i + 1,
              signature: line.trim(),
              importance: this.assessFunctionImportance(line)
            });
            break;
          }
        }
      }
    } else {
      // Fallback to heuristic analysis
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNumber = i + 1;

        // Skip empty lines and comments
        if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
          continue;
        }

        // Identify function signatures
        if (line.includes('function ') && !line.includes('//')) {
          const functionMatch = line.match(/function\s+(\w+)\s*\(/);
          if (functionMatch) {
            uncoveredFunctions.push({
              file,
              functionName: functionMatch[1],
              lineNumber,
              signature: line,
              importance: this.assessFunctionImportance(line)
            });
          }
        }

        // Identify branch conditions
        if (line.includes('if ') || line.includes('require(') || line.includes('assert(') || 
            line.includes('for ') || line.includes('while ')) {
          const branchType = this.identifyBranchType(line);
          if (branchType) {
            uncoveredBranches.push({
              file,
              lineNumber,
              condition: line,
              branchType,
              importance: this.assessBranchImportance(line)
            });
          }
        }

        // Identify potentially uncovered lines
        if (this.isExecutableLine(line)) {
          uncoveredLines.push({
            file,
            lineNumber,
            code: line,
            importance: this.assessLineImportance(line)
          });
        }
      }
    }

    // Calculate coverage metrics
    const totalLines = lines.filter(line => this.isExecutableLine(line.trim())).length;
    const totalFunctions = sourceCode.match(/function\s+\w+\s*\(/g)?.length || 0;
    
    return {
      file,
      lineCoverage: Math.max(0, 100 - (uncoveredLines.length / Math.max(totalLines, 1)) * 100),
      functionCoverage: Math.max(0, 100 - (uncoveredFunctions.length / Math.max(totalFunctions, 1)) * 100),
      branchCoverage: Math.max(0, 100 - (uncoveredBranches.length / 10) * 100), // Estimate
      totalLines,
      coveredLines: totalLines - uncoveredLines.length,
      totalFunctions,
      coveredFunctions: totalFunctions - uncoveredFunctions.length,
      uncoveredLines,
      uncoveredFunctions,
      uncoveredBranches
    };
  }

  async prioritizeUncoveredCode(coverageReport: CoverageReport): Promise<PrioritizedUncovered> {
    console.log(chalk.dim('  Prioritizing uncovered code for test generation...'));
    
    // Sort by importance and limit to manageable numbers
    const prioritizedLines = coverageReport.uncoveredLines
      .sort((a, b) => this.getImportanceScore(b.importance) - this.getImportanceScore(a.importance))
      .slice(0, 50); // Top 50 lines

    const prioritizedFunctions = coverageReport.uncoveredFunctions
      .sort((a, b) => this.getImportanceScore(b.importance) - this.getImportanceScore(a.importance))
      .slice(0, 20); // Top 20 functions

    const prioritizedBranches = coverageReport.uncoveredBranches
      .sort((a, b) => this.getImportanceScore(b.importance) - this.getImportanceScore(a.importance))
      .slice(0, 30); // Top 30 branches

    // Identify high-priority files
    const fileMap = new Map<string, number>();
    [...prioritizedLines, ...prioritizedFunctions, ...prioritizedBranches].forEach(item => {
      const count = fileMap.get(item.file) || 0;
      fileMap.set(item.file, count + 1);
    });

    const highPriorityFiles = Array.from(fileMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file]) => file);

    return {
      lines: prioritizedLines,
      functions: prioritizedFunctions,
      branches: prioritizedBranches,
      files: highPriorityFiles
    };
  }

  // Helper methods
  private isExecutableLine(line: string): boolean {
    return line.length > 0 && 
           !line.startsWith('//') && 
           !line.startsWith('/*') && 
           !line.startsWith('*') && 
           !line.startsWith('}') && 
           !line.startsWith('{') &&
           (line.includes(';') || line.includes('{') || line.includes('require') || line.includes('revert'));
  }

  private identifyBranchType(line: string): 'if' | 'for' | 'while' | 'require' | 'assert' | null {
    if (line.includes('if ')) return 'if';
    if (line.includes('for ')) return 'for';
    if (line.includes('while ')) return 'while';
    if (line.includes('require(')) return 'require';
    if (line.includes('assert(')) return 'assert';
    return null;
  }

  private assessLineImportance(line: string): 'high' | 'medium' | 'low' {
    if (line.includes('revert') || line.includes('require') || line.includes('assert')) return 'high';
    if (line.includes('emit') || line.includes('transfer') || line.includes('call') || line.includes('send')) return 'high';
    if (line.includes('delete') || line.includes('selfdestruct')) return 'high';
    if (line.includes('storage') || line.includes('mapping') || line.includes('=')) return 'medium';
    return 'low';
  }

  private assessFunctionImportance(line: string): 'high' | 'medium' | 'low' {
    if (line.includes('external') || line.includes('public')) return 'high';
    if (line.includes('payable') || line.includes('onlyOwner') || line.includes('modifier')) return 'high';
    if (line.includes('internal')) return 'medium';
    return 'low';
  }

  private assessBranchImportance(line: string): 'high' | 'medium' | 'low' {
    if (line.includes('require') || line.includes('assert') || line.includes('revert')) return 'high';
    if (line.includes('if') && (line.includes('msg.sender') || line.includes('owner') || line.includes('balance'))) return 'high';
    if (line.includes('for') || line.includes('while')) return 'medium';
    return 'medium';
  }

  private calculateAverageLineCoverage(fileReports: FileCoverageReport[]): number {
    if (fileReports.length === 0) return 0;
    return fileReports.reduce((sum, report) => sum + report.lineCoverage, 0) / fileReports.length;
  }

  private calculateAverageFunctionCoverage(fileReports: FileCoverageReport[]): number {
    if (fileReports.length === 0) return 0;
    return fileReports.reduce((sum, report) => sum + report.functionCoverage, 0) / fileReports.length;
  }

  private calculateAverageBranchCoverage(fileReports: FileCoverageReport[]): number {
    if (fileReports.length === 0) return 0;
    return fileReports.reduce((sum, report) => sum + report.branchCoverage, 0) / fileReports.length;
  }

  private getImportanceScore(importance: 'high' | 'medium' | 'low'): number {
    switch (importance) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }
} 