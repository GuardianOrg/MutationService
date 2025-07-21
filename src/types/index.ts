export interface RunOptions {
  repo?: string;
  localPath?: string;
  token?: string;
  branch: string;
  output: string;
  openaiKey?: string;  // Made optional
  model: string;
  cleanup: boolean;
  iterative?: boolean;
  numMutants?: number;  // Number of mutants per file
}

export interface MutationConfig {
  // Repository configuration
  repository?: {
    url?: string;           // Git repository URL (use this OR local_path)
    local_path?: string;    // Path to local repository (use this OR url)
    branch?: string;        // Git branch (default: 'main')
    token?: string;         // GitHub token for private repos
  };
  
  // OpenAI configuration (now optional)
  openai?: {
    api_key?: string;       // OpenAI API key (optional - required only for test generation)
    model?: string;         // Model to use (default: 'gpt-4-turbo-preview')
  };
  
  // Output configuration
  output?: {
    directory?: string;     // Output directory (default: 'mutation-results')
    cleanup?: boolean;      // Clean up cloned repos after completion (default: true)
  };
  
  // Testing configuration
  testing?: {
    iterative?: boolean;    // Enable iterative mode (default: true)
    num_mutants?: number;   // Number of mutants to generate per file (default: 25)
  };
}

export interface MutationResult {
  file: string;
  line: number;
  column: number;
  mutationType: string;
  original: string;
  mutated: string;
  status: 'killed' | 'survived' | 'timeout' | 'error';
  testOutput?: string;
  killReason?: string;  // Added to store why it was killed
  mutantId?: string;    // Added to track specific mutants
  timestamp?: string;   // Added for tracking when the test was run
}

// New interface for storing complete mutation session data
export interface MutationSession {
  sessionId: string;
  timestamp: string;
  projectPath: string;
  config: MutationConfig;
  iterations: MutationIteration[];
  summary: MutationSummary;
}

export interface MutationIteration {
  iterationNumber: number;
  timestamp: string;
  mutationResults: MutationResult[];
  generatedTests?: GeneratedTest[];  // Optional since AI might not be used
  stats: {
    total: number;
    killed: number;
    survived: number;
    timeout: number;
    error: number;
  };
}

export interface TestGap {
  mutationResult: MutationResult;
  context: string;
  suggestedTest?: string;
}

export interface GeneratedTest {
  fileName: string;
  content: string;
  description: string;
  targetedMutations: MutationResult[];
}

export interface MutationSummary {
  totalMutations: number;
  killedMutations: number;
  survivedMutations: number;
  mutationScore: number;
  gaps: TestGap[];
  generatedTests: GeneratedTest[];
} 