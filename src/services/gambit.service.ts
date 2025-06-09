import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { MutationResult } from '../types';

const execAsync = promisify(exec);

export class GambitService {
  private gambitPath: string = 'gambit';

  async checkGambitInstalled(): Promise<boolean> {
    try {
      await execAsync(`${this.gambitPath} --help`);
      return true;
    } catch {
      return false;
    }
  }

  async installGambit(): Promise<void> {
    const spinner = ora('Installing Gambit...').start();
    
    try {
      // For now, we'll use a direct approach - download from releases
      spinner.text = 'Downloading Gambit binary...';
      
      // Create a local bin directory
      const localBinDir = path.join(process.cwd(), '.bin');
      await fs.mkdir(localBinDir, { recursive: true });
      
      const gambitBinPath = path.join(localBinDir, 'gambit');
      
      // Try to build from source using cargo if available
      try {
        spinner.text = 'Checking if Rust/Cargo is available...';
        await execAsync('cargo --version');
        
        spinner.text = 'Building Gambit from source...';
        // Clone and build Gambit
        const tempDir = path.join(process.cwd(), '.gambit-temp');
        await fs.rm(tempDir, { recursive: true, force: true });
        await execAsync(`git clone https://github.com/Certora/gambit.git ${tempDir}`);
        await execAsync('cargo build --release', { cwd: tempDir });
        
        // Copy the built binary
        const builtBinary = path.join(tempDir, 'target', 'release', 'gambit');
        await fs.copyFile(builtBinary, gambitBinPath);
        
        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true });
        
      } catch (cargoError) {
        // If cargo is not available, provide instructions
        throw new Error(
          'Gambit installation requires Rust/Cargo or manual download.\n' +
          'Please either:\n' +
          '1. Install Rust from https://rustup.rs/ and run this command again\n' +
          '2. Download Gambit manually from https://github.com/Certora/gambit/releases\n' +
          '   and place it in your PATH or in .bin/gambit'
        );
      }
      
      // Make it executable
      await fs.chmod(gambitBinPath, 0o755);
      
      // Update the gambit path to use the local binary
      this.gambitPath = gambitBinPath;
      
      // Verify installation
      await execAsync(`${this.gambitPath} --help`);
      spinner.succeed(chalk.green(`Gambit installed successfully`));
      
    } catch (error) {
      spinner.fail(chalk.red('Failed to install Gambit'));
      throw error;
    }
  }

  async prepareProject(projectPath: string): Promise<void> {
    const spinner = ora('Preparing project for mutation testing...').start();
    
    try {
      // Check if it's a Forge project
      const foundryTomlPath = path.join(projectPath, 'foundry.toml');
      const isForgeProject = await fs.access(foundryTomlPath).then(() => true).catch(() => false);
      
      if (isForgeProject) {
        spinner.text = 'Detected Forge project, checking dependencies...';
        console.log(chalk.dim(`  Project path: ${projectPath}`));
        
        // Install dependencies if needed
        try {
          spinner.text = 'Installing Forge dependencies...';
          console.log(chalk.dim('  Running: forge install'));
          const { stdout: installOutput } = await execAsync('forge install', { 
            cwd: projectPath,
            timeout: 60000 // 60 second timeout
          });
          if (installOutput) {
            console.log(chalk.dim(`  Install output: ${installOutput.trim()}`));
          }
        } catch (e: any) {
          console.log(chalk.yellow(`  Forge install skipped: ${e.message?.split('\n')[0] || 'Already installed'}`));
        }
        
        // Build the project
        spinner.text = 'Building Forge contracts...';
        console.log(chalk.dim('  Running: forge build'));
        console.log(chalk.dim('  This may take a while for large projects...'));
        
        try {
          const { stdout, stderr } = await execAsync('forge build', { 
            cwd: projectPath,
            maxBuffer: 1024 * 1024 * 10,
            timeout: 300000 // 5 minute timeout for large projects
          });
          
          if (stdout) {
            const lines = stdout.trim().split('\n');
            console.log(chalk.dim(`  Build output: ${lines[lines.length - 1]}`));
          }
          
          if (stderr && !stderr.includes('Warning')) {
            throw new Error(`Forge build failed: ${stderr}`);
          }
          
          spinner.succeed(chalk.green('Project built successfully'));
        } catch (buildError: any) {
          if (buildError.code === 'ETIMEDOUT') {
            spinner.fail(chalk.red('Forge build timed out after 5 minutes'));
            throw new Error('Build timeout - project may be too large or have network dependencies');
          }
          throw buildError;
        }
      } else {
        // Check for Hardhat
        const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');
        const hardhatConfigTsPath = path.join(projectPath, 'hardhat.config.ts');
        const isHardhatProject = await fs.access(hardhatConfigPath).then(() => true).catch(() => 
          fs.access(hardhatConfigTsPath).then(() => true).catch(() => false)
        );
        
        if (isHardhatProject) {
          spinner.text = 'Detected Hardhat project, checking package.json...';
          console.log(chalk.dim(`  Project path: ${projectPath}`));
          
          // Install dependencies
          spinner.text = 'Installing npm dependencies...';
          console.log(chalk.dim('  Running: npm install'));
          console.log(chalk.dim('  This may take a while...'));
          
          try {
            await execAsync('npm install', { 
              cwd: projectPath,
              timeout: 180000 // 3 minute timeout
            });
            console.log(chalk.dim('  Dependencies installed'));
          } catch (installError: any) {
            if (installError.code === 'ETIMEDOUT') {
              spinner.fail(chalk.red('npm install timed out after 3 minutes'));
              throw new Error('Install timeout - check network connection');
            }
            throw installError;
          }
          
          // Check for and run any setup scripts
          try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            
            // Common setup script names
            const setupScripts = ['setup', 'prepare', 'postinstall', 'build:dependencies'];
            
            for (const scriptName of setupScripts) {
              if (packageJson.scripts && packageJson.scripts[scriptName]) {
                spinner.text = `Running ${scriptName} script...`;
                console.log(chalk.dim(`  Running: npm run ${scriptName}`));
                try {
                  await execAsync(`npm run ${scriptName}`, { 
                    cwd: projectPath,
                    maxBuffer: 1024 * 1024 * 10,
                    timeout: 120000 // 2 minute timeout per script
                  });
                  console.log(chalk.dim(`  ${scriptName} completed`));
                } catch (e: any) {
                  console.warn(chalk.yellow(`  Warning: ${scriptName} script failed: ${e.message?.split('\n')[0]}`));
                }
              }
            }
          } catch (e) {
            console.log(chalk.dim('  No package.json found or unable to read'));
          }
          
          // Try to compile
          spinner.text = 'Compiling Hardhat contracts...';
          console.log(chalk.dim('  Running: npx hardhat compile'));
          
          try {
            await execAsync('npx hardhat compile', { 
              cwd: projectPath,
              maxBuffer: 1024 * 1024 * 10,
              timeout: 180000 // 3 minute timeout
            });
            spinner.succeed(chalk.green('Project compiled successfully'));
          } catch (compileError: any) {
            if (compileError.code === 'ETIMEDOUT') {
              spinner.fail(chalk.red('Hardhat compile timed out after 3 minutes'));
              throw new Error('Compile timeout - project may be too large');
            }
            
            // If compilation fails due to missing files, try to create them or skip
            if (compileError.message.includes('Cannot find module')) {
              spinner.warn(chalk.yellow('Project has missing dependencies, attempting to continue...'));
              console.log(chalk.dim(`  Error: ${compileError.message.split('\n')[0]}`));
              
              // Try to at least compile the contracts directory
              try {
                console.log(chalk.dim('  Trying: npx hardhat compile --force'));
                await execAsync('npx hardhat compile --force', { 
                  cwd: projectPath,
                  maxBuffer: 1024 * 1024 * 10,
                  timeout: 120000
                });
              } catch {
                spinner.warn(chalk.yellow('Could not compile project, will attempt mutation testing anyway'));
              }
            } else {
              throw compileError;
            }
          }
        } else {
          spinner.warn(chalk.yellow('Could not detect project type (Forge/Hardhat). Assuming project is already compiled.'));
          console.log(chalk.dim('  No foundry.toml or hardhat.config found'));
        }
      }
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to prepare project'));
      console.error(chalk.red(`  Error details: ${error.message}`));
      throw error;
    }
  }

  async setupGambitConfig(projectPath: string): Promise<void> {
    const spinner = ora('Setting up Gambit configuration...').start();
    
    try {
      // Detect project type and adjust config accordingly
      const foundryTomlPath = path.join(projectPath, 'foundry.toml');
      const isForgeProject = await fs.access(foundryTomlPath).then(() => true).catch(() => false);
      
      // Try to find the contracts directory
      let sourceRoot = "contracts";
      const possibleDirs = ["contracts", "src", "contract", "sol"];
      
      for (const dir of possibleDirs) {
        try {
          await fs.access(path.join(projectPath, dir));
          sourceRoot = dir;
          break;
        } catch {
          // Continue checking
        }
      }
      
      // Try to find solc - check common locations
      let solcPath = "solc";
      try {
        await execAsync('which solc');
      } catch {
        // Try to find solc in node_modules
        try {
          const { stdout } = await execAsync('find node_modules -name solc -type f -perm +111 | head -1', { cwd: projectPath });
          if (stdout.trim()) {
            solcPath = stdout.trim();
          }
        } catch {
          // Try npx hardhat compile --show-stack-traces to get solc path
          try {
            const { stdout } = await execAsync('npx hardhat compile --help | grep solc', { cwd: projectPath });
            // If hardhat is available, use it to compile
            solcPath = "npx hardhat compile";
          } catch {
            console.warn(chalk.yellow('Warning: solc not found, Gambit may fail'));
          }
        }
      }
      
      // Configure to process all Solidity files in the source directory
      const config = {
        filename: `${sourceRoot}/**/*.sol`,  // Process all .sol files recursively
        sourceroot: ".",
        skip_validate: true,
        mutations: [
          "binary-op-mutation",
          "unary-operator-mutation",
          "require-mutation",
          "assignment-mutation",
          "delete-expression-mutation",
          "swap-arguments-operator-mutation",
          "elim-delegate-mutation",
        ],
        outdir: "gambit_out",
        solc: solcPath,
        num_mutants: 50,  // Increased limit since we're processing all files
        // Add solc remappings for common imports
        solc_remappings: [
          "@openzeppelin/=node_modules/@openzeppelin/",
          "@uniswap/=node_modules/@uniswap/"
        ]
      };

      const configPath = path.join(projectPath, 'gambit.conf.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      
      spinner.succeed(chalk.green('Gambit configuration created'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to create Gambit configuration'));
      throw error;
    }
  }

  async setupGambitConfigWithoutDependencies(projectPath: string): Promise<void> {
    const spinner = ora('Setting up Gambit configuration...').start();
    
    try {
      // Detect project type and adjust config accordingly
      const foundryTomlPath = path.join(projectPath, 'foundry.toml');
      const isForgeProject = await fs.access(foundryTomlPath).then(() => true).catch(() => false);
      
      // Try to find the contracts directory
      let sourceRoot = "contracts";
      const possibleDirs = ["contracts", "src", "contract", "sol"];
      
      for (const dir of possibleDirs) {
        try {
          await fs.access(path.join(projectPath, dir));
          sourceRoot = dir;
          break;
        } catch {
          // Continue checking
        }
      }

      // Find source files and filter out test files
      const glob = require('glob');
      const allSolFiles = glob.sync(`${sourceRoot}/**/*.sol`, { cwd: projectPath });
      
      // Filter out test files based on common patterns
      const sourceFiles = allSolFiles.filter((file: string) => {
        const fileName = path.basename(file);
        const filePath = file.toLowerCase();
        
        // Exclude common test patterns
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

      if (sourceFiles.length === 0) {
        throw new Error(`No source files found in ${sourceRoot} directory (after excluding test files)`);
      }

      console.log(chalk.dim(`  Found ${sourceFiles.length} source files (excluding ${allSolFiles.length - sourceFiles.length} test files)`));
      
      // Get proper remappings using forge remappings command
      let solcRemappings: string[] = [];
      try {
        if (isForgeProject) {
          const { stdout: remappingsOutput } = await execAsync('forge remappings', { cwd: projectPath });
          const allRemappings = remappingsOutput
            .trim()
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('Warning:'))
            .map(line => line.trim());
          
          // Use ALL remappings for proper import resolution
          solcRemappings = allRemappings;
          
          console.log(chalk.dim(`  Found and will use all ${solcRemappings.length} remappings from forge config`));
        }

      } catch (e) {
        console.log(chalk.dim('  Could not get forge remappings, using defaults'));
        // Add default remappings if forge remappings fails
        solcRemappings = isForgeProject ? [
          "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
          "@uniswap/v4-core/=lib/v4-core/",
          "v4-core/=lib/v4-core/src/", 
          "forge-std/=lib/forge-std/src/",
          "ds-test/=lib/ds-test/src/",
        ] : [
          "@openzeppelin/=node_modules/@openzeppelin/",
          "@uniswap/=node_modules/@uniswap/",
        ];
      }
      
      console.log(chalk.dim(`  Will process all ${sourceFiles.length} files individually during mutation testing`));
      console.log(chalk.dim(`  Gambit configurations will be generated dynamically for each file`));
      
      spinner.succeed(chalk.green(`Setup complete. Found ${sourceFiles.length} source files ready for mutation testing`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to create Gambit configuration'));
      throw error;
    }
  }

  async ensureSolcAvailable(projectPath: string): Promise<string> {
    // Check if solc is available
    try {
      await execAsync('solc --version');
      return 'solc';
    } catch {
      // Try to install solc-select and use it
      try {
        console.log(chalk.yellow('Solc not found, attempting to install...'));
        
        // Check if Python/pip is available
        try {
          await execAsync('python3 -m pip --version');
          // Install solc-select
          await execAsync('python3 -m pip install solc-select');
          // Install a specific solc version
          await execAsync('solc-select install 0.8.19');
          await execAsync('solc-select use 0.8.19');
          return 'solc';
        } catch {
          // Python not available, try npm
          await execAsync('npm install -g solc', { cwd: projectPath });
          return 'solcjs';
        }
      } catch {
        // If all else fails, try to use the project's solc
        const { stdout } = await execAsync(
          'find . -path ./node_modules -prune -o -name solc -type f -print | head -1',
          { cwd: projectPath }
        );
        if (stdout.trim()) {
          return stdout.trim();
        }
        
        throw new Error('Could not find or install Solidity compiler (solc)');
      }
    }
  }

  async runMutationTesting(projectPath: string): Promise<MutationResult[]> {
    const spinner = ora('Running mutation testing...').start();
    
    try {
      // Ensure Gambit is installed
      const isInstalled = await this.checkGambitInstalled();
      if (!isInstalled) {
        spinner.text = 'Gambit not found, installing...';
        await this.installGambit();
      }

      // Ensure solc is available
    //   spinner.text = 'Checking Solidity compiler...';
    //   const solcPath = await this.ensureSolcAvailable(projectPath);
      
      // Update the config with the correct solc path
      const configPath = path.join(projectPath, 'gambit.conf.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    //   config.solc = solcPath;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Prepare the project (compile, install deps, etc.)
      await this.prepareProject(projectPath);

      // Run Gambit mutation testing
      spinner.text = 'Generating mutants...';
      const { stdout: mutateOutput } = await execAsync(`${this.gambitPath} mutate --json gambit.conf.json`, { 
        cwd: projectPath,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      // Parse the results
      const results = await this.parseGambitResults(projectPath);
      
      spinner.succeed(chalk.green(`Mutation testing completed. Found ${results.length} mutations`));
      return results;
    } catch (error) {
      spinner.fail(chalk.red('Mutation testing failed'));
      throw error;
    }
  }

  async runMutationTestingWithoutSetup(projectPath: string): Promise<MutationResult[]> {
    const spinner = ora('Running mutation testing...').start();
    
    try {
      // Ensure Gambit is installed
      const isInstalled = await this.checkGambitInstalled();
      if (!isInstalled) {
        spinner.text = 'Gambit not found, installing...';
        await this.installGambit();
      }

      // Get all source files to process (excluding test files)
      const foundryTomlPath = path.join(projectPath, 'foundry.toml');
      const isForgeProject = await fs.access(foundryTomlPath).then(() => true).catch(() => false);
      
      // Find the contracts directory
      let sourceRoot = "contracts";
      const possibleDirs = ["contracts", "src", "contract", "sol"];
      
      for (const dir of possibleDirs) {
        try {
          await fs.access(path.join(projectPath, dir));
          sourceRoot = dir;
          break;
        } catch {
          // Continue checking
        }
      }
      
      // Find source files and filter out test files
      const glob = require('glob');
      const allSolFiles = glob.sync(`${sourceRoot}/**/*.sol`, { cwd: projectPath });
      
      // Filter out test files based on common patterns
      const sourceFiles = allSolFiles.filter((file: string) => {
        const fileName = path.basename(file);
        const filePath = file.toLowerCase();
        
        // Exclude common test patterns
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

      if (sourceFiles.length === 0) {
        throw new Error(`No source files found in ${sourceRoot} directory (after excluding test files)`);
      }

      console.log(chalk.blue(`🎯 Running mutation testing on ${sourceFiles.length} source files...`));
      console.log(chalk.dim('  Excluding test files from mutation testing'));
      
      // Auto-detect essential remappings (full list causes Gambit to crash)
      let solcRemappings: string[] = [];
      try {
        if (isForgeProject) {
          const { stdout: remappingsOutput } = await execAsync('forge remappings', { cwd: projectPath });
          const allRemappings = remappingsOutput
            .trim()
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('Warning:'))
            .map(line => line.trim());
          
          // Filter to only essential remappings that don't crash Gambit
          solcRemappings = allRemappings.filter(mapping => {
            return mapping.includes('@openzeppelin/contracts/=') || 
                   mapping.includes('v4-core/=') ||
                   mapping.includes('v4-periphery/=') ||
                   mapping.includes('@uniswap/v4-core/=') ||
                   mapping.includes('forge-std/=');
          });
          
          console.log(chalk.dim(`  Using ${solcRemappings.length} essential remappings (${allRemappings.length} total available)`));
        }
      } catch (e) {
        console.log(chalk.dim('  Could not get forge remappings, using defaults'));
      }

      // Check if solc is available and get the correct PATH
      let solcPath = 'solc';
      
      // Build comprehensive PATH with all common solc-select locations
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      const possibleSolcPaths = [
        // Python user installs (solc-select common locations)
        `${homeDir}/Library/Python/3.9/bin`,   // macOS Python 3.9
        `${homeDir}/Library/Python/3.10/bin`,  // macOS Python 3.10
        `${homeDir}/Library/Python/3.11/bin`,  // macOS Python 3.11
        `${homeDir}/Library/Python/3.12/bin`,  // macOS Python 3.12
        `${homeDir}/.local/bin`,                // Linux user installs
        `/usr/local/bin`,                       // System installs
        `/opt/homebrew/bin`,                    // Homebrew (M1 Mac)
        `/usr/bin`,                             // Default system
      ].filter(Boolean);
      
      const envPath = `${possibleSolcPaths.join(':')}:${process.env.PATH}`;
      console.log(chalk.dim(`  Using enhanced PATH with multiple solc-select locations`));
      
      try {
        const { stdout: whichSolc } = await execAsync('which solc', { 
          env: { ...process.env, PATH: envPath }
        });
        solcPath = whichSolc.trim();
        console.log(chalk.dim(`  Found solc at: ${solcPath}`));
      } catch {
        throw new Error(
          'Solidity compiler (solc) not found in PATH.\n' +
          'Please ensure solc-select is properly installed and in PATH:\n' +
          '  • pip3 install solc-select\n' +
          '  • solc-select install <your-version>\n' +
          '  • solc-select use <your-version>\n' +
          '  • export PATH="$HOME/Library/Python/3.9/bin:$PATH"\n' +
          '  • Or install globally: brew install solidity'
        );
      }
      
      // Process each source file individually
      const results: MutationResult[] = [];
      const processResults = [];
      
      for (let i = 0; i < sourceFiles.length; i++) {
        const sourceFile = sourceFiles[i];
        console.log(chalk.cyan(`\n📄 Processing file ${i + 1}/${sourceFiles.length}: ${sourceFile}`));
        
        try {
          // Configure to process ONE file at a time
          const config: any = {
            filename: sourceFile,  // Single file only!
            sourceroot: ".",
            skip_validate: true,
            mutations: [
              "binary-op-mutation",
              "unary-operator-mutation", 
              "require-mutation",
              "assignment-mutation",
              "delete-expression-mutation",
              "swap-arguments-operator-mutation",
              "elim-delegate-mutation",
            ],
            outdir: `gambit_out_${path.basename(sourceFile, '.sol')}`, // Unique output dir per file
            solc: "solc", // Use just "solc" and rely on PATH 
            num_mutants: 25
          };

          // Auto-detect and use ALL remappings for proper import resolution
          if (solcRemappings.length > 0) {
            config.solc_remappings = solcRemappings;
          }

          // Run gambit with the config
          const configPath = path.join(projectPath, `gambit-config-${i}.json`);
          await fs.writeFile(configPath, JSON.stringify(config, null, 2));
          
          console.log(chalk.dim(`  Running: gambit mutate --json ${path.basename(configPath)}`));
          
          const { stdout: gambitOutput, stderr: gambitError } = await execAsync(
            `${this.gambitPath} mutate --json ${path.basename(configPath)}`,
            { 
              cwd: projectPath,
              maxBuffer: 1024 * 1024 * 10, // 10MB buffer
              env: { ...process.env, PATH: envPath },
              timeout: 300000 // 5 minute timeout
            }
          );
          
          console.log(chalk.green(`  ✅ Gambit completed for ${sourceFile}`));
          if (gambitOutput) {
            console.log(chalk.dim(`  Output: ${gambitOutput.substring(0, 200)}...`));
          }
          
          // Parse results from this file's output directory
          let fileResults: MutationResult[] = [];
          try {
            fileResults = await this.parseGambitResults(projectPath, config.outdir);
            results.push(...fileResults);
          } catch (parseError) {
            console.log(chalk.yellow(`  Warning: Could not parse results for ${sourceFile}: ${parseError}`));
          }
          
          // Clean up config file
          await fs.unlink(configPath);
          
          processResults.push({
            file: sourceFile,
            success: true,
            outputDir: config.outdir,
            mutations: fileResults?.length || 0
          });
          
        } catch (error: any) {
          console.log(chalk.red(`  ❌ Failed to process ${sourceFile}: ${error.message}`));
          processResults.push({
            file: sourceFile,
            success: false,
            error: error.message
          });
        }
      }
      
      // Summary
      const successful = processResults.filter(r => r.success).length;
      const failed = processResults.filter(r => !r.success).length;
      const totalMutations = results.length;
      
      console.log(chalk.blue(`\n📊 Mutation Testing Summary:`));
      console.log(chalk.green(`  ✅ Successfully processed: ${successful} files`));
      console.log(chalk.cyan(`  🧬 Total mutations generated: ${totalMutations}`));
      if (failed > 0) {
        console.log(chalk.red(`  ❌ Failed: ${failed} files`));
      }
      
      spinner.succeed(chalk.green(`Mutation testing completed. Generated ${totalMutations} mutations across ${successful} files`));
      return results;
    } catch (error: any) {
      spinner.fail(chalk.red('Mutation testing failed'));
      console.error(chalk.red('Error details:'));
      console.error(chalk.red(`  Message: ${error.message}`));
      if (error.stderr) {
        console.error(chalk.red(`  Stderr: ${error.stderr}`));
      }
      if (error.cmd) {
        console.error(chalk.red(`  Command: ${error.cmd}`));
      }
      throw error;
    }
  }

  private async parseGambitResults(projectPath: string, outputDir?: string): Promise<MutationResult[]> {
    const results: MutationResult[] = [];
    const gambitOutputDir = outputDir ? path.join(projectPath, outputDir) : path.join(projectPath, 'gambit_out');
    
    try {
      // Read the gambit_results.json file that Gambit generates
      const resultsPath = path.join(gambitOutputDir, 'gambit_results.json');
      const resultsData = await fs.readFile(resultsPath, 'utf-8');
      const gambitResults = JSON.parse(resultsData);

      // Read mutants.log for additional information
      const mutantsLogPath = path.join(gambitOutputDir, 'mutants.log');
      const mutantsLog = await fs.readFile(mutantsLogPath, 'utf-8');
      const logLines = mutantsLog.trim().split('\n');

      // Parse each line of mutants.log
      for (const line of logLines) {
        const parts = line.split(',');
        if (parts.length >= 6) {
          const [id, mutationType, file, location, original, mutated] = parts;
          const [line, column] = location.split(':').map(n => parseInt(n));
          
          results.push({
            file: file,
            line: line,
            column: column,
            mutationType: mutationType,
            original: original.trim(),
            mutated: mutated.trim(),
            status: 'survived', // We'll update this after running tests
            testOutput: ''
          });
        }
      }

      // If we have test results, update the status
      if (gambitResults.testResults) {
        for (let i = 0; i < results.length && i < gambitResults.testResults.length; i++) {
          results[i].status = gambitResults.testResults[i].killed ? 'killed' : 'survived';
          results[i].testOutput = gambitResults.testResults[i].output || '';
        }
      }
    } catch (error) {
      console.error(chalk.yellow('Failed to parse Gambit results, attempting fallback...'));
      // Return empty results rather than failing completely
      return [];
    }

    return results;
  }

  async getSurvivedMutations(results: MutationResult[]): Promise<MutationResult[]> {
    return results.filter(r => r.status === 'survived');
  }
} 