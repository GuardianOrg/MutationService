# Forge Mutation Tester - Usage Guide

This guide covers how to use the Forge Mutation Tester with TOML configuration files.

## Quick Start

1. **Install the tool**:
   ```bash
   npm install -g forge-mutation-tester
   ```

2. **Create a configuration file**:
   ```bash
   forge-mutation-tester init
   ```

3. **Edit `mutation-config.toml`** with your settings

4. **Run mutation testing**:
   ```bash
   forge-mutation-tester mutation-config.toml
   ```

## Configuration File Format

The tool uses TOML format for configuration. Here's the structure:

```toml
[repository]
# Choose ONE: remote URL or local path
url = "https://github.com/owner/repo"     # Remote repository
# OR
local_path = "./my-project"               # Local directory

branch = "main"                           # Optional (remote only)
token = "ghp_..."                         # Optional (private repos)

[openai]
# Optional - only needed for AI test generation
api_key = "sk-..."                        # Your OpenAI API key
model = "gpt-4-turbo-preview"             # Optional model selection

[output]
directory = "mutation-results"             # Optional
cleanup = true                            # Optional (remote only)

[testing]
# iterative = true                        # Default, set to false for single run
# num_mutants = 25                        # Number of mutants per file (default: 25)
```

## Common Use Cases

### 1. Basic Mutation Testing (No AI)

```toml
[repository]
local_path = "."  # Current directory

# No [openai] section needed
```

This will:
- Run mutation testing on your project
- Save all results to `mutation-results/`
- Show which mutations survived
- Allow manual test writing

### 2. Full AI-Powered Testing

```toml
[repository]
local_path = "./my-project"

[openai]
api_key = "sk-your-key"
```

This adds:
- Automatic test generation for survived mutations
- AI analysis of gaps
- Generated test files ready to add to your suite

### 3. Private Repository

```toml
[repository]
url = "https://github.com/myorg/private-repo"
token = "ghp_your_github_token"

[openai]
api_key = "sk-your-key"
```

### 4. Iterative Testing

```toml
[repository]
local_path = "./my-project"

[openai]
api_key = "sk-your-key"

[testing]
# iterative = true  # Default, re-run after adding tests
# num_mutants = 50  # Generate more mutants for thorough testing
```

## Iterative Testing Workflow

By default (or when `iterative = true`), the tool helps you progressively improve your test suite:

```
┌─────────────────┐
│ Run Mutation    │
│ Testing         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate Tests  │
│ for Survivors   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ You: Add Tests  │
│ to Your Suite   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Re-run Only     │
│ Previous        │
│ Survivors       │
└────────┬────────┘
         │
         ▼
    [Repeat]
```

### Example Iterative Session

```bash
$ forge-mutation-tester config.toml

━━━ Iteration 1 ━━━
Total mutations: 50
Killed: 35 (70%)
Survived: 15

Generating tests for 15 survived mutations...
✓ Generated 3 test files

Press Enter to continue after adding tests...

━━━ Iteration 2 ━━━
Re-testing 15 previously survived mutations...
✅ Progress! Killed 8 more mutations
Remaining: 7

[Continue until satisfied]
```

## Advanced Configuration

### Custom Output Directory

```toml
[output]
directory = "./my-mutation-tests"
```

### Different AI Models

```toml
[openai]
api_key = "sk-..."
model = "gpt-4"  # or "gpt-3.5-turbo" for faster/cheaper
```

### Keep Cloned Repos

```toml
[output]
cleanup = false  # Don't delete cloned repos
```

### Controlling Mutation Count

Adjust the number of mutants generated per file:

```toml
[testing]
num_mutants = 10   # Quick testing with fewer mutants
# OR
num_mutants = 50   # Thorough testing with more mutants
```

The default is 25 mutants per file, which provides a good balance between thoroughness and speed.

## Stored Results

All mutation results are automatically saved:

### Session File (`mutation-session.json`)
Contains complete session data including:
- All iterations and their results
- Configuration used
- Timestamps
- Summary statistics

### Mutation Results (`mutation-results.json`)
Detailed results for each mutation:
- File, line, and column
- Original vs mutated code
- Status (killed/survived/timeout/error)
- Kill reason (if killed)
- Timestamp

### Per-Iteration Results
In iterative mode, each iteration's results are saved separately:
- `mutation-results-iteration-1.json`
- `mutation-results-iteration-2.json`
- etc.

## Using Results for Analysis

The stored JSON files can be used for:
- Tracking mutation testing progress over time
- Analyzing patterns in survived mutations
- Building custom reports or visualizations
- Integrating with CI/CD pipelines

Example: Reading results programmatically
```javascript
const session = JSON.parse(fs.readFileSync('mutation-results/mutation-session.json'));
console.log(`Total iterations: ${session.iterations.length}`);
console.log(`Final mutation score: ${session.summary.mutationScore}%`);
```

## Troubleshooting

### OpenAI API Key

The tool can work with or without an OpenAI API key:

**With API key**: Full functionality including AI test generation
```toml
[openai]
api_key = "sk-proj-..."  # Your actual key
```

**Without API key**: Mutation testing only (no test generation)
```toml
# Omit the [openai] section entirely
```

### Project Setup

Before running mutation testing, ensure:
- `forge test` passes
- Project compiles: `