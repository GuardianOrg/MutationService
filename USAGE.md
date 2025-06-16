# 🛡️ Forge Mutation Tester - Usage Guide

A comprehensive guide for using the AI-powered mutation testing and coverage analysis tool for Solidity smart contracts.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Commands Overview](#commands-overview)
- [Mutation Testing Guide](#mutation-testing-guide)
- [Coverage Analysis Guide](#coverage-analysis-guide)
- [Output Directory Behavior](#output-directory-behavior)
- [Common Scenarios](#common-scenarios)
- [Understanding Results](#understanding-results)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## 🚀 Quick Start

### Installation
```bash
npm install -g forge-mutation-tester
```

### Basic Mutation Testing
```bash
# Set your OpenAI API key
export OPENAI_API_KEY="your-openai-api-key-here"

# Run mutation testing on a public repository
forge-mutation-tester run -r https://github.com/user/solidity-project

# Run on a private repository
forge-mutation-tester run -r https://github.com/user/private-project -t YOUR_GITHUB_PAT
```

---

## ✅ Prerequisites

### Required for Both Commands
- **Node.js 18+**
- **Git** (for repository cloning)
- **OpenAI API key** with sufficient credits
- **Forge (Foundry) or Hardhat** project

### Additional for Mutation Testing
- **Solidity compiler (solc)** matching your project's version
- **Rust/Cargo** (for Gambit installation)

### For Coverage Analysis
- **Working coverage command** in your project

---

## 🔧 Environment Setup

### 1. OpenAI API Key (Required)
```bash
# Option A: Environment variable (recommended)
export OPENAI_API_KEY="sk-your-key-here"

# Option B: Command line flag
forge-mutation-tester run --openai-key "sk-your-key-here" -r https://github.com/user/repo
```

### 2. GitHub Personal Access Token (Optional)
Only required for private repositories:
```bash
# For private repositories
export GITHUB_TOKEN="ghp_your-token-here"
forge-mutation-tester run -r https://github.com/user/private-repo -t $GITHUB_TOKEN
```

### 3. Solidity Compiler Setup (Mutation Testing Only)
```bash
# Install solc-select (recommended)
pip3 install solc-select

# Check your project's Solidity version
grep "pragma solidity" src/*.sol | head -1

# Install matching version (example: 0.8.26)
solc-select install 0.8.26
solc-select use 0.8.26

# Add to PATH (macOS)
export PATH="/Users/$USER/Library/Python/3.9/bin:$PATH"

# Verify installation
solc --version
```

---

## 📖 Commands Overview

### Mutation Testing
```bash
forge-mutation-tester run [options]
```
- Tests your test quality using mutation testing
- Generates Guardian Mutation Score
- Creates AI-powered tests for gaps

### Coverage Analysis  
```bash
forge-mutation-tester coverage [options]
```
- Analyzes test coverage gaps
- Generates tests to increase coverage
- Provides coverage improvement strategy

---

## 🧬 Mutation Testing Guide

### Basic Usage
```bash
forge-mutation-tester run -r https://github.com/user/repo
```

### All Options
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

### What Happens:

#### 1. **Repository Setup**
```
🧬 Forge Mutation Tester

Step 1: Cloning repository...
✓ Repository cloned to: .mutation-testing-temp/project
```

#### 2. **Manual Setup Phase**
You'll see project-specific setup instructions:
```
🔧 Please complete the following setup steps:

🔨 Detected Forge/Foundry project

Run these commands in your terminal:
cd .mutation-testing-temp/project
forge install
forge build  
forge test
```

#### 3. **Confirmation**
```
❓ Is your project ready for mutation testing?
Type "yes" or "y" to continue: y
```

#### 4. **Automated Testing**
```
Step 3: Setting up and running mutation tests...
🧬 Generated 25 mutants across 3 files
🧪 Now testing each mutant...

🧬 Testing mutant 1/25 (ID: 1) in src/Token.sol...
    💀 KILLED - Tests failed with this mutant

🧬 Testing mutant 2/25 (ID: 2) in src/Token.sol...  
    🧟 SURVIVED - Tests still pass with this mutant
```

#### 5. **Guardian Analysis**
```
🛡️ Guardian Mutation Analysis
Guardian Mutation Score: 72.5/100 🥈
Grade: C - Moderate test quality

🚨 Critical Gaps:
  1. src/Token.sol:45 - require-mutation
     "require(amount > 0)" → "require(true)" (Priority: 70)
```

#### 6. **AI Test Generation**
```
Step 5: Generating tests to cover gaps...
✓ Generated 3 test files targeting survived mutations

✓ Saved TokenMutation.t.sol
✓ Saved VaultMutation.t.sol
✓ Saved SecurityMutation.t.sol
```

---

## 📊 Coverage Analysis Guide

### Basic Usage
```bash
forge-mutation-tester coverage -r https://github.com/user/repo
```

### With Target Coverage
```bash
forge-mutation-tester coverage -r https://github.com/user/repo --target-coverage 95
```

### What Happens:

#### 1. **Coverage Analysis**
```
📊 Forge Coverage Analyzer

Step 3: Analyzing current test coverage...
✓ Parsed coverage: 73.5% 

📊 Current Coverage Summary:
  • Overall Coverage: 73.50%
  • Target Coverage: 90%  
  • Uncovered Lines: 45
  • Gap: 16.50%
```

#### 2. **Gap Identification**
```
Step 4: Generating tests to increase coverage...
🎯 Targeting high-priority uncovered code:
  • Token.sol:89 - transfer function error handling
  • Vault.sol:156 - emergency withdrawal logic
```

#### 3. **Test Generation**
```
✓ Generated 4 coverage test files

Results:
  • Current Coverage: 73.50%
  • Generated test files: 4
  • Uncovered lines addressed: 38
```

---

## 📂 Output Directory Behavior

### Where Files Are Saved

The tool saves generated tests and reports to your **current working directory** by default:

```bash
# You're in your project directory
cd ~/my-project

# Run mutation testing on any repository
forge-mutation-tester run -r https://github.com/other/solidity-repo

# Results are saved to YOUR current directory:
# ~/my-project/generated-tests/
#   ├── TokenMutation.t.sol
#   ├── VaultMutation.t.sol  
#   ├── guardian-mutation-analysis.md
#   └── mutation-testing-summary.md
```

### Custom Output Location

```bash
# Specify custom output directory
forge-mutation-tester run -r https://github.com/other/repo -o ./my-analysis

# Results saved to:
# ~/my-project/my-analysis/
```

### Temporary Files

```bash
# Repository cloning (automatically cleaned up):
# ~/.mutation-testing-temp/repo-name/  ← Temporary, deleted after

# Your results (permanent):  
# ~/your-current-directory/generated-tests/  ← Kept for you to use
```

---

## 💡 Common Scenarios

### Scenario 1: Analyzing Your Own Project
```bash
# You're working on your project
cd ~/my-defi-protocol

# Analyze your current project
forge-mutation-tester run -r https://github.com/yourteam/my-defi-protocol

# Results appear in your project directory for easy integration:
# ~/my-defi-protocol/generated-tests/
```
**Use Case**: Improve your own project's test quality before deployment.

### Scenario 2: Analyzing External Projects  
```bash
# Create a dedicated analysis folder
mkdir ~/mutation-analysis && cd ~/mutation-analysis

# Analyze external projects
forge-mutation-tester run -r https://github.com/external/interesting-protocol

# Results saved to your analysis directory:
# ~/mutation-analysis/generated-tests/
```
**Use Case**: Research how well other projects are tested, security analysis.

### Scenario 3: Team Code Review
```bash
# Reviewer's workflow
cd ~/code-reviews/pull-request-123

# Analyze the PR's repository/branch
forge-mutation-tester run -r https://github.com/team/project -b feature-branch

# Results in review directory for sharing:
# ~/code-reviews/pull-request-123/generated-tests/
```
**Use Case**: Code review process, evaluate test quality of new features.

### Scenario 4: Batch Analysis
```bash
# Create organized analysis structure
mkdir ~/protocol-analysis
cd ~/protocol-analysis

# Analyze multiple projects with custom output directories
forge-mutation-tester run -r https://github.com/team/project-a -o ./project-a-analysis
forge-mutation-tester run -r https://github.com/team/project-b -o ./project-b-analysis

# Organized results:
# ~/protocol-analysis/
#   ├── project-a-analysis/
#   └── project-b-analysis/
```
**Use Case**: Comparative analysis across multiple projects.

### Scenario 5: CI/CD Integration
```bash
# In your GitHub Actions workflow
- name: Mutation Testing
  run: |
    mkdir ./mutation-reports
    forge-mutation-tester run -r ${{ github.repository }} -o ./mutation-reports
    
# Results saved to: ./mutation-reports/ in CI environment
# Can be uploaded as artifacts or used in subsequent steps
```
**Use Case**: Automated testing in continuous integration.

---

## 📈 Understanding Results

### Guardian Mutation Score
- **90-100**: 🏆 Exceptional (Grade A) - Production ready
- **80-89**: 🥇 Good (Grade B) - Minor improvements needed  
- **70-79**: 🥈 Moderate (Grade C) - Focus on security gaps
- **60-69**: 🥉 Below Average (Grade D) - Significant work needed
- **<60**: 🚨 Poor (Grade F) - Major overhaul required

### Output Files

#### Mutation Testing Output:
```
generated-mutation-tests/
├── TokenMutation.t.sol           # Tests for Token.sol gaps
├── VaultMutation.t.sol           # Tests for Vault.sol gaps  
├── SecurityMutation.t.sol        # Tests for security gaps
├── guardian-mutation-analysis.md # Comprehensive analysis
└── mutation-testing-summary.md   # AI-generated summary
```

#### Coverage Analysis Output:
```
generated-coverage-tests/
├── TokenCoverage.t.sol           # Tests for Token.sol coverage
├── VaultCoverage.t.sol           # Tests for Vault.sol coverage
├── coverage-analysis-summary.md  # Coverage strategy report
```

### Reading the Guardian Analysis Report

The `guardian-mutation-analysis.md` contains:

- **Executive Summary**: Guardian Score and grade
- **Critical Gaps**: Highest priority survived mutations
- **File Analysis**: Best/worst performing files
- **Mutation Type Analysis**: Which types of bugs are missed
- **Actionable Recommendations**: Specific improvement steps
- **Next Steps**: Clear action plan

---

## 🔧 Troubleshooting

### Common Issues

#### "OpenAI API key is required"
```bash
# Make sure key is set
echo $OPENAI_API_KEY

# Or provide via flag
forge-mutation-tester run --openai-key "your-key" -r repo-url
```

#### "Solidity compiler (solc) not found"
```bash
# Install solc-select
pip3 install solc-select

# Install your project's version
solc-select install 0.8.26
solc-select use 0.8.26

# Add to PATH
export PATH="/Users/$USER/Library/Python/3.9/bin:$PATH"
```

#### "Failed to clone repository"
```bash
# For private repos, add token
forge-mutation-tester run -r https://github.com/user/private-repo -t YOUR_GITHUB_PAT

# Check repository URL is correct
```

#### "Gambit installation failed"
```bash
# Install Rust/Cargo first
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Then run mutation testing again
```

#### "Project setup failed"
```bash
# Make sure you can run these manually:
cd cloned-project
forge install  # or npm install
forge build    # or npx hardhat compile  
forge test     # or npx hardhat test
```

#### "Out of memory errors"
```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" forge-mutation-tester run -r repo-url
```

### Performance Issues

#### Slow mutation testing:
- Reduce `num_mutants` in source code (currently 3)
- Focus on specific files by cleaning up repository
- Use faster OpenAI model: `--model gpt-3.5-turbo`

#### High API costs:
- Use `gpt-3.5-turbo` instead of `gpt-4`
- Start with smaller projects
- Review survived mutations manually before generating tests

---

## 🎯 Best Practices

### Before Running
1. **Clean Test Suite**: Ensure existing tests pass
2. **Version Control**: Commit changes before running  
3. **API Limits**: Check OpenAI account credits/limits
4. **Time Budget**: Mutation testing can take 30+ minutes

### During Analysis
1. **Review Critical Gaps**: Focus on high-priority survived mutations
2. **Security First**: Address `require-mutation` and `elim-delegate-mutation` first
3. **File Priority**: Start with worst-performing files
4. **Understand Context**: Read the generated analysis report thoroughly

### After Results
1. **Test the Generated Tests**: Run the generated tests to ensure they work
2. **Manual Review**: Review AI-generated tests for correctness
3. **Integrate Gradually**: Add generated tests in phases
4. **Re-run Analysis**: Test your improvements with another run

### Team Usage
1. **Shared Environment**: Ensure team has same solc version
2. **Documentation**: Share the analysis reports with team
3. **Regular Runs**: Integrate into CI/CD for ongoing monitoring
4. **Knowledge Sharing**: Review critical gaps in team meetings

---

## 📞 Support

- **Issues**: Report bugs at the GitHub repository
- **Questions**: Check the main README.md for detailed documentation  
- **Feature Requests**: Open an issue with enhancement label

---

*Happy testing! 🛡️ Build more secure smart contracts with AI-powered mutation testing.* 