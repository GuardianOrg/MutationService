import simpleGit, { SimpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

export class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  async cloneRepository(
    repoUrl: string,
    targetDir: string,
    branch: string = 'main',
    token?: string
  ): Promise<string> {
    const spinner = ora('Cloning repository...').start();
    
    try {
      // Parse the repository URL
      let cloneUrl = repoUrl;
      
      // If token is provided, inject it into the URL for private repos
      if (token) {
        const urlParts = new URL(repoUrl);
        urlParts.username = token;
        urlParts.password = 'x-oauth-basic';
        cloneUrl = urlParts.toString();
      }

      // Ensure target directory doesn't exist
      const repoName = path.basename(repoUrl, '.git');
      const fullPath = path.join(targetDir, repoName);
      
      try {
        await fs.access(fullPath);
        // Directory exists, remove it
        await fs.rm(fullPath, { recursive: true, force: true });
      } catch {
        // Directory doesn't exist, which is fine
      }

      // Clone the repository
      await this.git.clone(cloneUrl, fullPath, ['--branch', branch, '--depth', '1']);
      
      spinner.succeed(chalk.green(`Repository cloned successfully to ${fullPath}`));
      return fullPath;
    } catch (error) {
      spinner.fail(chalk.red('Failed to clone repository'));
      throw error;
    }
  }

  async cleanup(repoPath: string): Promise<void> {
    const spinner = ora('Cleaning up cloned repository...').start();
    
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      spinner.succeed(chalk.green('Cleanup completed'));
    } catch (error) {
      spinner.fail(chalk.yellow('Failed to cleanup repository'));
      // Don't throw, as cleanup failure is not critical
    }
  }
} 