# 🧬 Forge Mutation Tester

An AI-powered CLI tool that combines mutation testing with automatic test generation for Solidity smart contracts. This tool clones your repository, guides you through manual setup, then uses Gambit for mutation testing (excluding test files) and OpenAI to generate Forge tests that cover identified gaps in your test suite.

## Features

- 🔍 **Automated Mutation Testing**: Uses Gambit to identify weaknesses in your test suite
- 🤖 **AI-Powered Test Generation**: Leverages OpenAI to generate Forge tests for survived mutations
- 🔐 **Private Repository Support**: Works with private repositories using Personal Access Tokens
- 📊 **Comprehensive Reports**: Generates detailed summaries of mutation testing results
- 🎯 **Targeted Testing**: Creates tests specifically designed to kill survived mutations
- ⚡ **Manual Setup Control**: You control dependency installation and project preparation
- 🛡️ **Test File Exclusion**: Only mutates source files, never test files

## Prerequisites

- Node.js 18+ 
- Git
- **Solidity compiler (solc) installed globally**
- Rust/Cargo (for Gambit installation)
- OpenAI API key
- **Your project should use Forge (Foundry) or Hardhat**

## Installation

### 1. Install Solidity Compiler (Required)

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

### 2. Install Mutation Tester

```bash
# Clone this repository
git clone <repository-url>
cd forge-mutation-tester

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## How It Works

### New Manual Setup Approach

1. **Clone Repository**: The tool clones your target repository
2. **Manual Setup Phase**: You manually install dependencies and ensure tests pass
3. **User Confirmation**: The tool waits for your confirmation that setup is complete
4. **Gambit Installation**: Automatically installs Gambit if needed
5. **Mutation Testing**: Runs mutation testing on **source files only** (test files excluded)
6. **AI Analysis**: Analyzes survived mutations and generates targeted tests
7. **Results**: Saves generated tests and comprehensive summary report

## Usage

### Basic Usage

```bash
forge-mutation-tester run -r https://github.com/user/repo
```

### With Private Repository

```bash
forge-mutation-tester run -r https://github.com/user/private-repo -t YOUR_GITHUB_PAT
```

### Full Options

```bash
forge-mutation-tester run \
  -r https://github.com/user/repo \
  -t YOUR_GITHUB_PAT \
  -b main \
  -o ./generated-tests \
  --openai-key YOUR_OPENAI_KEY \
  --model gpt-4-turbo-preview \
  --no-cleanup
```

## What Happens When You Run It

1. **Repository Cloning**: Your repo is cloned automatically
2. **Setup Instructions**: The tool detects your project type and shows you exactly what commands to run
3. **Manual Setup**: You run the setup commands in your terminal:
   - **For Forge projects**: `forge install`, `forge build`, `forge test`
   - **For Hardhat projects**: `npm install`, `npx hardhat compile`, `npx hardhat test`
4. **Confirmation**: Type "yes" when your project is ready
5. **Automatic Mutation Testing**: The tool handles the rest automatically

## Options

- `-r, --repo <url>` - Git repository URL (required)
- `-t, --token <token>` - Personal Access Token for private repositories
- `-b, --branch <branch>` - Branch to test (default: "main")
- `-o, --output <dir>` - Output directory for generated tests (default: "./generated-tests")
- `--openai-key <key>` - OpenAI API key (or set OPENAI_API_KEY env var)
- `--model <model>` - OpenAI model to use (default: "gpt-4-turbo-preview")
- `--no-cleanup` - Keep cloned repository after testing

## Environment Variables

You can set the following environment variables instead of passing them as options:

```bash
export OPENAI_API_KEY=your_openai_api_key
```

## Example Session

```bash
$ forge-mutation-tester run -r https://github.com/user/my-defi-project

🧬 Forge Mutation Tester

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

✅ Requirements:
  • All dependencies installed
  • All contracts compile successfully
  • All existing tests pass
  • Project is ready for mutation testing

📝 Notes:
  • Only source .sol files will be mutated (test files excluded)
  • Gambit will be installed automatically if needed
  • Make sure you have Rust/Cargo installed for Gambit compilation

❓ Is your project ready for mutation testing?
Type "yes" or "y" to continue, anything else to cancel: y

Step 3: Setting up and running mutation tests...
✓ Gambit configuration created (test files excluded)
✓ Mutation testing completed. Found 25 mutations (source files only)

Step 4: Analyzing test gaps...
⚠️  Found 8 survived mutations

Step 5: Generating tests to cover gaps...
Step 6: Saving generated tests...
Step 7: Generating summary report...

✅ Mutation testing completed successfully!

Results:
  • Total mutations: 25
  • Killed mutations: 17
  • Survived mutations: 8
  • Mutation score: 68.00%
  • Generated test files: 3

Output saved to: ./generated-tests
```

## Output

The tool generates:

- **Test Files**: Forge test contracts targeting survived mutations
- **Summary Report**: Markdown file with detailed analysis including:
  - Mutation testing statistics
  - Test coverage gaps analysis
  - Recommendations for improvement
  - Description of generated tests

## Example Output Structure

```
generated-tests/
├── Token.mutation.t.sol
├── Vault.mutation.t.sol
└── mutation-testing-summary.md
```

## Test File Exclusion

The tool automatically excludes these patterns from mutation testing:
- `**/test/**/*.sol` - Files in test directories
- `**/*.test.sol` - Files ending with .test.sol
- `**/*.t.sol` - Files ending with .t.sol
- `**/tests/**/*.sol` - Files in tests directories
- `**/Test*.sol` - Files starting with Test
- `**/*Test.sol` - Files ending with Test

## Supported Mutation Types

The tool tests for various mutation types including:

- Binary operator mutations (e.g., `+` to `-`)
- Unary operator mutations
- Require statement mutations
- Assignment mutations
- Delete expression mutations
- Conditional boundary mutations
- Delegate call eliminations

## Best Practices

1. **Clean Test Suite**: Ensure your existing tests pass before running mutation testing
2. **Manual Control**: You control when dependencies are installed and when the project is ready
3. **Review Generated Tests**: AI-generated tests should be reviewed before adding to your test suite
4. **Iterative Improvement**: Run the tool periodically as you develop to maintain high test quality
5. **Source Files Only**: The tool only mutates source contracts, never test files

## Troubleshooting

### "Failed to invoke solc" Error or Version Mismatch

If you see `Error: Failed to invoke solc` or version mismatch errors, install the **exact** Solidity compiler version your project uses:

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
- Ensure `solc` is available globally (`solc --version` should work)

### OpenAI API Key

Ensure your OpenAI API key has sufficient credits and access to the specified model.

### Memory Issues

For large codebases, you may need to increase Node.js memory:

```bash
NODE_OPTIONS="--max-old-space-size=4096" forge-mutation-tester run -r <repo>
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT 