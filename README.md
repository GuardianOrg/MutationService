# 🧬 Forge Testing Suite

An AI-powered CLI tool that provides comprehensive test analysis for Solidity smart contracts. This tool combines **mutation testing** and **coverage analysis** with automatic test generation to improve your test suite quality and coverage.

## Two Powerful Commands

### 🧬 Mutation Testing (`run`)
Identifies weaknesses in test quality by using Gambit mutation testing and AI-generated tests to kill survived mutations.

### 📊 Coverage Analysis (`coverage`)  
Analyzes test coverage gaps and generates AI-powered tests to increase coverage percentage and test completeness.

## Features

### 🧬 Mutation Testing Features
- 🔍 **Automated Mutation Testing**: Uses Gambit to identify weaknesses in your test suite
- 🎯 **Targeted Test Generation**: Creates tests specifically designed to kill survived mutations
- 🛡️ **Test File Exclusion**: Only mutates source files, never test files
- 📊 **Mutation Score Analysis**: Comprehensive reports on mutation testing effectiveness
- ⚡ **Real Test Execution**: Actually runs tests against each mutant to determine kill vs survival

### 📊 Coverage Analysis Features  
- 📈 **Smart Coverage Analysis**: Uses `forge coverage` or `hardhat coverage` with LCOV parsing
- 🧠 **AI-Powered Gap Detection**: Identifies uncovered lines, functions, and branches with importance scoring
- 🎯 **Targeted Coverage Tests**: Generates tests to hit specific uncovered code paths
- 📋 **Coverage Strategy Reports**: Detailed recommendations for reaching target coverage

### 🤖 Shared AI Features
- 🤖 **Advanced Test Generation**: Leverages OpenAI GPT-4 to generate realistic, context-aware tests
- 🔐 **Private Repository Support**: Works with private repositories using Personal Access Tokens
- ⚡ **Manual Setup Control**: You control dependency installation and project preparation
- 📊 **Comprehensive Reports**: Detailed analysis and improvement recommendations

## Prerequisites

### For Both Commands
- Node.js 18+ 
- Git
- OpenAI API key
- **Your project should use Forge (Foundry) or Hardhat**

### Additional for Mutation Testing (`run`)
- **Solidity compiler (solc) installed globally** (exact version matching your project)
- Rust/Cargo (for Gambit installation)

### For Coverage Analysis (`coverage`)
- Working `forge coverage` or `npx hardhat coverage` command in your project

## Installation

### 1. Install Solidity Compiler (Required for Mutation Testing)

Gambit requires `solc` to be available globally **with the exact version your project uses**.

**⚠️ IMPORTANT:** The solc version must match your project's `pragma solidity` version exactly.

**Install solc-select (Recommended):**
```bash
pip3 install solc-select

# Check your project's solidity version
grep "pragma solidity" src/*.sol | head -1

# Install and use the matching version (example for 0.8.26)
solc-select install 0.8.26
solc-select use 0.8.26

# Add to PATH if needed
export PATH="/Users/$USER/Library/Python/3.9/bin:$PATH"
```

**Alternative Options:**
```bash
# Option A: Homebrew (only installs latest)
brew install solidity

# Option B: npm (only installs latest)
npm install -g solc
```

**Verify installation and version:**
```bash
solc --version
# Should match your project's pragma solidity version
```

### 2. Install Forge Testing Suite

```bash
# Clone this repository  
git clone <repository-url>
cd forge-testing-suite

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## How It Works

### Proper Mutation Testing Workflow

1. **Clone Repository**: The tool clones your target repository
2. **Manual Setup Phase**: You manually install dependencies and ensure tests pass
3. **User Confirmation**: The tool waits for your confirmation that setup is complete
4. **Gambit Installation**: Automatically installs Gambit if needed
5. **Mutant Generation**: Runs mutation testing on **source files only** (test files excluded)
6. **Mutation Testing**: For each generated mutant:
   - Replaces the original source file with the mutant
   - Runs your existing test suite (`forge test` or `npx hardhat test`)
   - Determines if the mutant is **killed** (tests fail) or **survived** (tests pass)
   - Restores the original file
7. **AI Analysis**: Analyzes survived mutations and generates targeted tests
8. **Results**: Saves generated tests and comprehensive summary report with mutation scores

### Key Metrics

- **Mutation Score**: Percentage of mutants killed by your tests (higher is better)
- **Killed Mutants**: Mutants that caused tests to fail (indicates good test coverage)
- **Survived Mutants**: Mutants that didn't break any tests (indicates gaps in test coverage)

### Coverage Analysis Workflow

1. **Repository Cloning**: Your repo is cloned automatically
2. **Setup Instructions**: Shows setup commands for your project type
3. **Manual Setup**: You run the setup commands in your terminal
4. **Coverage Analysis**: Runs coverage tools and parses LCOV/output data
5. **AI Test Generation**: Generates tests targeting uncovered lines, functions, and branches

## Usage

### Mutation Testing Command

#### Basic Usage
```bash
forge-mutation-tester run -r https://github.com/user/repo
```

#### With Private Repository
```bash
forge-mutation-tester run -r https://github.com/user/private-repo -t YOUR_GITHUB_PAT
```

#### Full Options
```bash
forge-mutation-tester run \
  -r https://github.com/user/repo \
  -t YOUR_GITHUB_PAT \
  -b main \
  -o ./generated-mutation-tests \
  --openai-key YOUR_OPENAI_KEY \
  --model gpt-4-turbo-preview \
  --no-cleanup
```

### Coverage Analysis Command

#### Basic Usage
```bash
forge-mutation-tester coverage -r https://github.com/user/repo
```

#### With Target Coverage
```bash
forge-mutation-tester coverage -r https://github.com/user/repo --target-coverage 95
```

#### Full Options
```bash
forge-mutation-tester coverage \
  -r https://github.com/user/repo \
  -t YOUR_GITHUB_PAT \
  -b main \
  -o ./generated-coverage-tests \
  --target-coverage 90 \
  --openai-key YOUR_OPENAI_KEY \
  --model gpt-4-turbo-preview \
  --no-cleanup
```

## What Happens When You Run It

### Mutation Testing (`run` command)

1. **Repository Cloning**: Your repo is cloned automatically
2. **Setup Instructions**: The tool detects your project type and shows you exactly what commands to run
3. **Manual Setup**: You run the setup commands in your terminal:
   - **For Forge projects**: `forge install`, `forge build`, `forge test`
   - **For Hardhat projects**: `npm install`, `npx hardhat compile`, `npx hardhat test`
   - **Solc Installation**: Install exact matching Solidity compiler version
4. **Confirmation**: Type "yes" when your project is ready
5. **Automatic Mutation Testing**: Gambit runs mutation testing on source files only
6. **AI Analysis**: Analyzes survived mutations and generates targeted tests

### Coverage Analysis (`coverage` command)

1. **Repository Cloning**: Your repo is cloned automatically
2. **Setup Instructions**: Shows setup commands for your project type
3. **Manual Setup**: You run the setup commands in your terminal:
   - **For Forge projects**: `forge install`, `forge build`, `forge test`, `forge coverage`
   - **For Hardhat projects**: `npm install`, `npx hardhat compile`, `npx hardhat test`, `npx hardhat coverage`
4. **Confirmation**: Type "yes" when your project is ready  
5. **Coverage Analysis**: Runs coverage tools and parses LCOV/output data
6. **AI Test Generation**: Generates tests targeting uncovered lines, functions, and branches

## Options

### Shared Options (Both Commands)
- `-r, --repo <url>` - Git repository URL (required)
- `-t, --token <token>` - Personal Access Token for private repositories
- `-b, --branch <branch>` - Branch to test (default: "main")
- `-o, --output <dir>` - Output directory for generated tests
- `--openai-key <key>` - OpenAI API key (or set OPENAI_API_KEY env var)
- `--model <model>` - OpenAI model to use (default: "gpt-4-turbo-preview")
- `--no-cleanup` - Keep cloned repository after testing

### Mutation Testing (`run`) Specific
- Default output directory: `./generated-tests`

### Coverage Analysis (`coverage`) Specific  
- `--target-coverage <percentage>` - Target coverage percentage (default: "95")
- Default output directory: `./generated-coverage-tests`

## Environment Variables

You can set the following environment variables instead of passing them as options:

```bash
export OPENAI_API_KEY=your_openai_api_key
```

## Example Sessions

### Mutation Testing Example

```bash
$ forge-mutation-tester run -r https://github.com/user/my-defi-project

🧬 Forge Testing Suite - Mutation Testing

Step 1: Cloning repository...
✓ Repository cloned

📋 Step 2: Project Setup Required

📁 Repository cloned to: .mutation-testing-temp/my-defi-project

🔧 Please complete the following setup steps:

🔨 Detected Forge/Foundry project

Run these commands in your terminal:

cd .mutation-testing-temp/my-defi-project
forge install
forge build
forge test

# Check and install matching solc version
grep "pragma solidity" src/*.sol | head -1
pip3 install solc-select
solc-select install 0.8.26  # Use your project's version
solc-select use 0.8.26
export PATH="/Users/$USER/Library/Python/3.9/bin:$PATH"

❓ Is your project ready for mutation testing?
Type "yes" or "y" to continue, anything else to cancel: y

Step 3: Setting up and running mutation tests...
✓ Mutation testing completed. Found 25 mutations (source files only)

Step 4: Analyzing test gaps...
⚠️  Found 8 survived mutations

Step 5: Generating tests to cover gaps...
✓ Generated 3 test files targeting survived mutations

✅ Mutation testing completed successfully!

Results:
  • Total mutations: 25
  • Killed mutations: 17
  • Survived mutations: 8
  • Mutation score: 68.00%
  • Generated test files: 3

Output saved to: ./generated-tests
```

### Coverage Analysis Example

```bash
$ forge-mutation-tester coverage -r https://github.com/user/my-defi-project --target-coverage 90

📊 Forge Coverage Analyzer & Test Generator

Step 1: Cloning repository...
✓ Repository cloned

📋 Step 2: Project Setup Required

📁 Repository cloned to: .coverage-analysis-temp/my-defi-project

🔧 Please complete the following setup steps:

🔨 Detected Forge/Foundry project

Run these commands in your terminal:

cd .coverage-analysis-temp/my-defi-project
forge install
forge build
forge test
forge coverage

❓ Is your project ready for coverage analysis?
Type "yes" or "y" to continue, anything else to cancel: y

Step 3: Analyzing current test coverage...
✓ Parsed coverage: 73.5% using pattern: Total.*?\|\s*([\d.]+)%

📊 Current Coverage Summary:
  • Overall Coverage: 73.50%
  • Target Coverage: 90%
  • Uncovered Lines: 45
  • Uncovered Functions: 8

⚠️  Coverage gap: 16.50% to reach target

Step 4: Generating tests to increase coverage...
✓ Generated 4 coverage test files

✅ Coverage analysis completed successfully!

Results:
  • Current Coverage: 73.50%
  • Target Coverage: 90%
  • Generated test files: 4
  • Uncovered lines addressed: 38

Output saved to: ./generated-coverage-tests
```

## Output

### Mutation Testing Output

- **Mutation Test Files**: Forge test contracts targeting survived mutations
- **Mutation Summary Report**: Detailed analysis including:
  - Mutation testing statistics
  - Test coverage gaps analysis
  - Recommendations for improvement
  - Description of generated tests

### Coverage Analysis Output

- **Coverage Test Files**: Forge test contracts targeting uncovered code
- **Coverage Summary Report**: Detailed analysis including:
  - Current coverage statistics
  - Critical gap analysis  
  - Strategy recommendations for reaching target coverage
  - Overview of generated tests

## Example Output Structures

### Mutation Testing Output
```
generated-tests/
├── Token.mutation.t.sol
├── Vault.mutation.t.sol
├── Admin.mutation.t.sol
└── mutation-testing-summary.md
```

### Coverage Analysis Output
```
generated-coverage-tests/
├── Token.coverage.t.sol
├── Vault.coverage.t.sol
├── Admin.coverage.t.sol
└── coverage-analysis-summary.md
```

## Test File Exclusion

The tool automatically excludes these patterns from mutation testing:
- `**/test/**/*.sol` - Files in test directories
- `**/*.test.sol` - Files ending with .test.sol
- `**/*.t.sol` - Files ending with .t.sol
- `**/tests/**/*.sol` - Files in tests directories
- `**/Test*.sol` - Files starting with Test
- `**/*Test.sol` - Files ending with Test

## Analysis Types

### Mutation Testing Types

The mutation testing command tests for various mutation types including:

- Binary operator mutations (e.g., `+` to `-`)
- Unary operator mutations
- Require statement mutations
- Assignment mutations
- Delete expression mutations
- Conditional boundary mutations
- Delegate call eliminations

### Coverage Analysis Targets

The coverage analysis command identifies and targets:

- **Uncovered Lines**: Executable code that was never run during tests
- **Uncovered Functions**: Functions (public, external, internal) that were never called
- **Uncovered Branches**: Conditional paths (if/else, require/assert, loops) not tested
- **High-Priority Code**: Critical functions like transfers, access controls, state changes
- **Edge Cases**: Boundary conditions and error paths often missed in testing

## Best Practices

### For Both Commands
1. **Clean Test Suite**: Ensure your existing tests pass before running any analysis
2. **Manual Control**: You control when dependencies are installed and when the project is ready
3. **Review Generated Tests**: AI-generated tests should be reviewed before adding to your test suite
4. **Iterative Improvement**: Run the tools periodically as you develop to maintain high test quality

### Mutation Testing Specific
5. **Source Files Only**: The tool only mutates source contracts, never test files
6. **Exact Solc Version**: Install the exact Solidity compiler version your project uses
7. **Quality Over Coverage**: Focus on test quality improvements rather than just coverage percentage

### Coverage Analysis Specific  
8. **Set Realistic Targets**: Start with achievable coverage targets (80-90%) rather than 100%
9. **Prioritize Critical Code**: Focus first on coverage of critical business logic and security functions
10. **Combine with Mutation Testing**: Use both commands together for comprehensive test suite analysis

## Troubleshooting

### "Failed to invoke solc" Error or Version Mismatch (Mutation Testing)

If you see `Error: Failed to invoke solc` or version mismatch errors during mutation testing, install the **exact** Solidity compiler version your project uses:

```bash
# Step 1: Check your project's solidity version
grep "pragma solidity" src/*.sol | head -1

# Step 2: Install solc-select (recommended)
pip3 install solc-select

# Step 3: Install and use the matching version
solc-select install 0.8.26  # Replace with your project's version
solc-select use 0.8.26

# Step 4: Add to PATH if needed
export PATH="/Users/$USER/Library/Python/3.9/bin:$PATH"

# Step 5: Verify version matches
solc --version
```

**⚠️ CRITICAL:** The solc version **must match exactly** with your project's `pragma solidity` statement. Version mismatches cause "No such file or directory" errors that are misleading.

### Coverage Command Shows 0.00% Despite Having Tests

If the coverage analysis shows 0.00% coverage but you have working tests:

1. **Check Coverage Tool Works**: Manually run `forge coverage` or `npx hardhat coverage` 
2. **Verify Output Format**: The tool parses multiple coverage report formats
3. **Check Project Structure**: Ensure test files are in expected locations (`test/`, `tests/`)
4. **Dependencies**: Ensure all project dependencies are properly installed

### Rust/Cargo Installation

Gambit requires Rust. Install from https://rustup.rs/:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Project Setup Issues

If your project doesn't compile:
- Check that all dependencies are installed
- Verify your Solidity version compatibility
- Ensure all imports resolve correctly
- Make sure your tests pass before proceeding
- Ensure `solc` is available globally (`