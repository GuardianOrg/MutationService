# 🛡️ Guardian Forge Mutation Tester

> **Version 3.0.0** - Now with TOML configuration, optional AI features, customizable mutation counts, and file filtering for large repositories!

A comprehensive mutation testing tool for Solidity smart contracts that helps identify weaknesses in your test suite. Uses [Gambit](https://github.com/Certora/gambit) for mutation generation and optionally leverages OpenAI for intelligent test generation.

## Overview

Forge Mutation Tester uses [Gambit](https://github.com/Certora/gambit) to perform mutation testing on your Solidity contracts. It can optionally leverage OpenAI's GPT models to automatically generate tests that kill surviving mutants. All mutation results are stored for later analysis.

## Features

- 🧬 **Mutation Testing**: Automatically introduces small changes (mutations) to your code and checks if your tests catch them
- 🤖 **AI-Powered Test Generation** (Optional): Uses OpenAI to generate targeted tests for surviving mutations
- 💾 **Persistent Results**: Stores all mutation results in JSON format for later analysis
- 🔄 **Iterative Testing**: Re-run mutation testing after adding tests to track improvement
- 📁 **Local & Remote Repos**: Works with both local projects and GitHub repositories
- 🎯 **Forge/Foundry Focused**: Optimized specifically for Forge/Foundry projects
- 🔍 **File Filtering**: Target specific files or directories in large repositories using glob patterns

## Prerequisites

- Node.js >= 18.0.0
- [Forge/Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- [Gambit](https://github.com/Certora/gambit) mutation testing tool
- OpenAI API key (optional - only required for test generation)

### Installing Gambit

```bash
# Install Rust if you haven't already
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Gambit
cargo install --git https://github.com/Certora/gambit.git
```

## Installation

```bash
npm install -g forge-mutation-tester
```

## Configuration

Forge Mutation Tester uses a TOML configuration file. Create a `mutation-config.toml` file:

```toml
[repository]
# Option 1: Test a remote repository
# url = "https://github.com/owner/repo"
# branch = "main"  # Optional
# token = "ghp_..."  # Optional, for private repos

# Option 2: Test a local project
local_path = "./path/to/your/project"

[openai]
# api_key = "sk-..."  # Optional - your OpenAI API key for test generation
# model = "gpt-4-turbo-preview"  # Optional

[output]
directory = "mutation-results"  # Optional
cleanup = true  # Optional, only for remote repos

[testing]
# iterative = true  # Optional, defaults to true
# num_mutants = 25  # Optional, defaults to 25

[files]
# Optional: Filter files for large repositories
# include = ["src/core/**/*.sol"]  # Only test matching patterns
# exclude = ["**/*Test.sol"]  # Skip these patterns
```

### Quick Start

1. Generate an example configuration:
   ```bash
   forge-mutation-tester init
   ```

2. Edit `mutation-config.toml` with your settings

3. Run mutation testing:
   ```bash
   forge-mutation-tester mutation-config.toml
   ```

## Usage Examples

### Testing a Local Project

```toml
[repository]
local_path = "./my-defi-protocol"

[openai]
api_key = "sk-your-key-here"
```

### Testing a GitHub Repository

```toml
[repository]
url = "https://github.com/OpenZeppelin/openzeppelin-contracts"
branch = "master"

[openai]
api_key = "sk-your-key-here"
```

### Testing Specific Files in Large Repositories

For large repositories, you can focus mutation testing on specific files or directories:

```toml
[repository]
local_path = "./my-large-defi-protocol"

[files]
# Only test core contracts and governance
include = [
  "contracts/core/**/*.sol",
  "contracts/governance/**/*.sol",
  "contracts/tokens/MainToken.sol"
]

# Skip test files, mocks, and deprecated code
exclude = [
  "**/*Test.sol",
  "**/test/**",
  "**/mocks/**",
  "contracts/deprecated/**",
  "**/interfaces/**"  # Interfaces have no implementation to mutate
]

[openai]
api_key = "sk-your-key-here"
```

#### File Pattern Syntax

The file filtering uses glob patterns:
- `**` - Matches any number of directories
- `*` - Matches any characters in a filename
- `?` - Matches a single character
- `[abc]` - Matches any character in the brackets
- `{a,b}` - Matches either pattern a or b

Common patterns:
- `src/**/*.sol` - All Solidity files in src and subdirectories
- `contracts/Token*.sol` - All files starting with "Token" in contracts/
- `**/*Test.sol` - All test files in any directory
- `**/interfaces/**` - All files in any interfaces directory

### Iterative Testing Mode

Iterative mode is enabled by default. To disable it and run only once:

```toml
[testing]
iterative = false
```

In iterative mode:
1. Run initial mutation testing
2. Review and add generated tests to your project
3. Tool prompts to continue
4. Re-runs testing on previously survived mutations
5. Shows improvement metrics

## How It Works

1. **Setup**: Clones the repository (if remote) or uses your local project
2. **Mutation**: Gambit generates mutants by making small changes to your Solidity code
3. **Testing**: Runs your test suite against each mutant
4. **Analysis**: Identifies mutations that survived (tests didn't catch the change)
5. **Generation**: AI analyzes survived mutations and generates targeted tests
6. **Output**: Saves generated tests and detailed reports

## Output Structure

```
mutation-results/
├── mutation-session.json     # Complete session data with all iterations
├── mutation-results.json     # Latest mutation results
├── mutation-results-iteration-N.json  # Results for each iteration
├── summary.json             # Overall mutation testing results  
├── survived-mutations.json  # Details of mutations that survived
├── generated-tests/         # AI-generated test files (if API key provided)
│   ├── Test_Contract1.t.sol
│   └── Test_Contract2.t.sol
└── analysis-report.md       # Human-readable analysis
```

## Using Without OpenAI

The tool works perfectly fine without an OpenAI API key. You can:
1. Run mutation testing to identify weaknesses in your test suite
2. View detailed reports of which mutations survived
3. Manually write tests to kill the surviving mutations
4. Re-run to see your progress

To use without AI:
```toml
[repository]
local_path = "./my-project"

# [openai] section can be omitted entirely
```

## Best Practices

1. **Start with a working test suite**: Ensure `forge test` passes before running mutation testing
2. **Review generated tests**: AI-generated tests should be reviewed before adding to your suite
3. **Use iterative mode**: Progressively improve test quality by adding tests and re-running
4. **Focus on critical contracts**: Test your most important contracts first
5. **Adjust gas limits**: Some mutations might cause infinite loops; tests with appropriate gas limits help detect these

## Troubleshooting

### "No mutants were generated"
- Ensure your project compiles: `forge build`
- Check that source files are in standard locations (`src/`, `contracts/`)
- Verify Gambit is installed: `gambit --version`

### "Command not found: forge"
- Install Foundry: https://book.getfoundry.sh/getting-started/installation
- Ensure forge is in your PATH

### Compilation errors during mutation testing
- Some mutations create invalid code (expected behavior)
- Focus on mutations that compile but aren't caught by tests

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## Acknowledgments

- [Gambit](https://github.com/Certora/gambit) - The mutation testing framework
- [Foundry](https://github.com/foundry-rs/foundry) - The Solidity development toolkit
- [OpenAI](https://openai.com) - For powering test generation