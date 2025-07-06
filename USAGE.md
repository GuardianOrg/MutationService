# Mutation Testing Usage Guide

## Quick Start

```bash
# Install
npm install -g forge-mutation-tester

# Set OpenAI key (required)
export OPENAI_API_KEY="sk-..."

# Run on existing local project
forge-mutation-tester run -l .

# Run on remote repo
forge-mutation-tester run -r https://github.com/user/repo
```

## Running on Existing Projects

### Option 1: Local Directory (Recommended)
```bash
# From your project root
cd /path/to/your/project
forge-mutation-tester run -l .

# Or specify path
forge-mutation-tester run -l /path/to/your/project
```

### Option 2: Remote Repository
```bash
# Public repo
forge-mutation-tester run -r https://github.com/user/repo

# Private repo (need GitHub token)
forge-mutation-tester run -r https://github.com/user/repo -t YOUR_GITHUB_TOKEN
```

## OpenAI API Key

Three ways to provide it:

```bash
# 1. Environment variable (recommended)
export OPENAI_API_KEY="sk-..."

# 2. Command line flag
forge-mutation-tester run -l . --openai-key "sk-..."

# 3. .env file in current directory
echo 'OPENAI_API_KEY=sk-...' > .env
```

## How Iterative Mode Works

Iterative mode lets you progressively improve your test suite:

```bash
# Enable with --iterative flag
forge-mutation-tester run -l . --iterative
```

**What happens:**

1. **First Run**: Finds all survived mutations (e.g., 8 survived)
2. **Generates Tests**: Creates tests to kill those mutations
3. **You Add Tests**: Copy relevant tests to your test suite
4. **Press Enter**: Tool re-runs mutation testing
5. **Shows Progress**: "Killed 3 more mutations!" (5 remain)
6. **Repeat**: Until all mutations killed or you're satisfied

**Example Session:**
```
Iteration 1: 25 mutations → 17 killed, 8 survived
  → Generated 3 test files in ./generated-tests/iteration-1/
  → You add tests to your project
  → Press Enter

Iteration 2: 25 mutations → 22 killed, 3 survived ✅ Progress!
  → Generated 2 test files in ./generated-tests/iteration-2/
  → You add tests
  → Press Enter

Iteration 3: 25 mutations → 25 killed, 0 survived 🎉 Perfect!
```

## Common Commands

### Basic Mutation Test
```bash
# Simplest - run in current directory
forge-mutation-tester run -l .
```

### With Custom Output
```bash
# Save results to specific folder
forge-mutation-tester run -l . -o ./mutation-results
```

### Iterative Improvement
```bash
# Keep improving until perfect
forge-mutation-tester run -l . --iterative
```

### Different AI Model
```bash
# Use GPT-4 (default) or others
forge-mutation-tester run -l . --model gpt-4-turbo-preview
```

## What You Need Before Running

1. **Compiled Project**: Run `forge build` or `npx hardhat compile` first
2. **Passing Tests**: Make sure `forge test` or `npx hardhat test` passes
3. **Solc Installed**: Exact version matching your project
   ```bash
   # Check your version
   grep "pragma solidity" src/*.sol
   
   # Install it
   pip3 install solc-select
   solc-select install 0.8.26
   solc-select use 0.8.26
   ```

## Understanding Results

**Guardian Score**: 0-100 rating of your test quality
- 90+ 🏆 Excellent
- 80-89 🥇 Good  
- 70-79 🥈 Moderate
- 60-69 🥉 Below Average
- <60 🚨 Needs Work

**Output Files**:
```
generated-tests/
├── Token.mutation.t.sol         # Generated test files
├── Vault.mutation.t.sol         
├── guardian-mutation-analysis.md # Detailed analysis
└── mutation-testing-summary.md   # Summary report
```

## Troubleshooting

**"Solc not found"**
```bash
# Install exact version your project uses
pip3 install solc-select
solc-select install 0.8.26  # Your version
solc-select use 0.8.26
export PATH="$HOME/Library/Python/3.9/bin:$PATH"
```

**"No mutations generated"**
- Check Solidity version (0.8.28+ may have issues)
- Ensure project compiles: `forge build`
- Try simpler contracts first

**"Tests still failing"**
- Review generated tests before adding
- Some generated tests may need tweaking
- Focus on understanding why mutations survived

## Tips

1. **Start Small**: Test one contract at a time
2. **Review Tests**: Don't blindly copy generated tests
3. **Understand Mutations**: Learn why they survived
4. **Set Goals**: Aim for 80%+ Guardian Score
5. **Use Iterative**: Let the tool guide improvement 