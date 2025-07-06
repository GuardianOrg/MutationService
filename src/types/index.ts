export interface RunOptions {
  repo?: string;
  localPath?: string;
  token?: string;
  branch: string;
  output: string;
  openaiKey: string;
  model: string;
  cleanup: boolean;
  iterative?: boolean;
  watch?: boolean;
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