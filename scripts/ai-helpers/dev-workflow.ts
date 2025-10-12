#!/usr/bin/env npx ts-node

/**
 * @fileoverview AI-friendly development workflow automation
 * @description Provides automated workflows for common development tasks
 * @author Mailer Team
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Optional } from '@sudobility/types';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

interface WorkflowConfig {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

interface WorkflowStep {
  name: string;
  command: string;
  description: string;
  required?: Optional<boolean>;
  continueOnError?: Optional<boolean>;
}

/**
 * Common development workflows for AI assistants
 */
const WORKFLOWS: Record<string, WorkflowConfig> = {
  'full-build': {
    name: 'Full Build',
    description: 'Complete build process for both EVM and Solana',
    steps: [
      {
        name: 'Clean',
        command: 'npm run clean',
        description: 'Clean all build artifacts',
        required: false,
      },
      {
        name: 'Install Dependencies',
        command: 'npm install',
        description: 'Install/update dependencies',
        required: true,
      },
      {
        name: 'Compile Contracts',
        command: 'npm run compile',
        description: 'Compile EVM and Solana contracts',
        required: true,
      },
      {
        name: 'Generate Types',
        command: 'npm run build',
        description: 'Build TypeScript and generate types',
        required: true,
      },
    ],
  },

  'test-all': {
    name: 'Test All',
    description: 'Run comprehensive test suite',
    steps: [
      {
        name: 'Compile First',
        command: 'npm run compile',
        description: 'Ensure contracts are compiled',
        required: true,
      },
      {
        name: 'Run EVM Tests',
        command: 'npm run test:evm',
        description: 'Run Hardhat/EVM tests',
        required: true,
      },
      {
        name: 'Run Solana Tests',
        command: 'npm run test:solana',
        description: 'Run Anchor/Solana tests',
        required: false,
        continueOnError: true,
      },
      {
        name: 'Run Unified Tests',
        command: 'npm run test:unified',
        description: 'Run cross-chain client tests',
        required: true,
      },
    ],
  },

  'new-feature': {
    name: 'New Feature Workflow',
    description: 'Complete workflow for implementing new features',
    steps: [
      {
        name: 'Pre-check: Clean Build',
        command: 'npm run clean && npm run compile',
        description: 'Start with clean slate',
        required: true,
      },
      {
        name: 'Run Existing Tests',
        command: 'npm test',
        description: 'Ensure existing functionality works',
        required: true,
      },
      {
        name: 'Post-implementation: Compile',
        command: 'npm run compile',
        description: 'Compile after changes (run this after code changes)',
        required: true,
      },
      {
        name: 'Post-implementation: Test',
        command: 'npm test',
        description: 'Run all tests after implementation',
        required: true,
      },
    ],
  },

  'quick-check': {
    name: 'Quick Check',
    description: 'Fast validation of current state',
    steps: [
      {
        name: 'TypeScript Check',
        command: 'npm run typecheck',
        description: 'Check TypeScript compilation',
        required: true,
        continueOnError: true,
      },
      {
        name: 'Lint Check',
        command: 'npm run lint',
        description: 'Check code style and quality',
        required: false,
        continueOnError: true,
      },
      {
        name: 'Quick Test',
        command: 'npm run test:evm -- --grep "basic"',
        description: 'Run basic functionality tests',
        required: true,
        continueOnError: true,
      },
    ],
  },

  'deploy-local': {
    name: 'Local Deployment',
    description: 'Deploy contracts to local development environment',
    steps: [
      {
        name: 'Compile Contracts',
        command: 'npm run compile',
        description: 'Ensure contracts are compiled',
        required: true,
      },
      {
        name: 'Start Local Node',
        command: 'npx hardhat node',
        description: 'Start local blockchain (run in background)',
        required: true,
        continueOnError: true,
      },
      {
        name: 'Deploy to Local',
        command: 'npm run deploy:local',
        description: 'Deploy contracts to local network',
        required: true,
      },
      {
        name: 'Verify Deployment',
        command: 'npm run test:evm -- --grep "deployment"',
        description: 'Verify contracts deployed correctly',
        required: false,
        continueOnError: true,
      },
    ],
  },
};

/**
 * Execute a workflow with comprehensive logging
 */
async function executeWorkflow(
  workflowName: string,
  options: { verbose?: Optional<boolean>; dryRun?: Optional<boolean> } = {}
): Promise<void> {
  const workflow = WORKFLOWS[workflowName];
  if (!workflow) {
    console.error(`❌ Unknown workflow: ${workflowName}`);
    console.log('\nAvailable workflows:');
    Object.keys(WORKFLOWS).forEach((name) => {
      console.log(`  • ${name}: ${WORKFLOWS[name].description}`);
    });
    process.exit(1);
  }

  console.log(`🚀 Starting workflow: ${workflow.name}`);
  console.log(`📋 Description: ${workflow.description}\n`);

  const results: Array<{
    step: string;
    success: boolean;
    output?: Optional<string>;
    error?: Optional<string>;
  }> = [];

  for (const [index, step] of workflow.steps.entries()) {
    const stepNum = index + 1;
    console.log(`\n[${stepNum}/${workflow.steps.length}] ${step.name}`);
    console.log(`   Command: ${step.command}`);
    console.log(`   Purpose: ${step.description}`);

    if (options.dryRun) {
      console.log(`   🔍 DRY RUN - would execute: ${step.command}`);
      results.push({ step: step.name, success: true });
      continue;
    }

    try {
      console.log(`   ⏳ Executing...`);
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(step.command, {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      const duration = Date.now() - startTime;
      console.log(`   ✅ Completed in ${duration}ms`);

      if (options.verbose && stdout) {
        console.log(`   📤 Output:\n${stdout.trim()}`);
      }

      if (stderr) {
        console.log(`   ⚠️  Warnings:\n${stderr.trim()}`);
      }

      results.push({ step: step.name, success: true, output: stdout });
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      console.log(`   ❌ Failed: ${errorMessage}`);

      results.push({ step: step.name, success: false, error: errorMessage });

      if (step.required && !step.continueOnError) {
        console.log(`\n💥 Workflow failed at required step: ${step.name}`);
        printSummary(results);
        process.exit(1);
      }

      if (step.continueOnError) {
        console.log(`   ⏭️  Continuing despite error...`);
      }
    }
  }

  console.log(`\n🎉 Workflow completed: ${workflow.name}`);
  printSummary(results);
}

/**
 * Print workflow execution summary
 */
function printSummary(
  results: Array<{
    step: string;
    success: boolean;
    output?: Optional<string>;
    error?: Optional<string>;
  }>
): void {
  console.log('\n📊 WORKFLOW SUMMARY');
  console.log('='.repeat(50));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`✅ Successful steps: ${successful.length}`);
  console.log(`❌ Failed steps: ${failed.length}`);
  console.log(
    `📈 Success rate: ${Math.round((successful.length / results.length) * 100)}%`
  );

  if (failed.length > 0) {
    console.log('\n❌ FAILED STEPS:');
    failed.forEach((result) => {
      console.log(`   • ${result.step}: ${result.error}`);
    });
  }

  console.log('\n💡 NEXT STEPS:');
  if (failed.length === 0) {
    console.log('   All steps completed successfully! 🎉');
  } else {
    console.log('   Review failed steps and resolve issues before proceeding.');
    console.log('   Re-run the workflow or individual commands as needed.');
  }
}

/**
 * Get project status and recommendations
 */
async function getProjectStatus(): Promise<void> {
  console.log('🔍 PROJECT STATUS CHECK\n');

  const checks = [
    {
      name: 'Dependencies',
      check: () => existsSync('node_modules'),
      fix: 'Run: npm install',
    },
    {
      name: 'EVM Compiled',
      check: () => existsSync('artifacts'),
      fix: 'Run: npx hardhat compile',
    },
    {
      name: 'Solana Compiled',
      check: () => existsSync('target'),
      fix: 'Run: anchor build',
    },
    {
      name: 'TypeChain Types',
      check: () => existsSync('typechain-types'),
      fix: 'Run: npm run compile',
    },
    {
      name: 'Package Built',
      check: () => existsSync('dist'),
      fix: 'Run: npm run build',
    },
  ];

  const issues: string[] = [];

  for (const check of checks) {
    const status = check.check() ? '✅' : '❌';
    console.log(`${status} ${check.name}`);
    if (!check.check()) {
      issues.push(check.fix);
    }
  }

  if (issues.length > 0) {
    console.log('\n🔧 RECOMMENDED FIXES:');
    issues.forEach((fix) => console.log(`   • ${fix}`));
    console.log('\n💡 Or run: npm run ai:workflow full-build');
  } else {
    console.log('\n🎉 Project is ready for development!');
  }
}

/**
 * Main CLI interface
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'list':
      console.log('📋 AVAILABLE WORKFLOWS:\n');
      Object.entries(WORKFLOWS).forEach(([name, workflow]) => {
        console.log(`🔧 ${name}`);
        console.log(`   ${workflow.description}`);
        console.log(`   Steps: ${workflow.steps.length}\n`);
      });
      break;

    case 'status':
      await getProjectStatus();
      break;

    case 'run':
      const workflowName = args[1];
      const verbose = args.includes('--verbose') || args.includes('-v');
      const dryRun = args.includes('--dry-run') || args.includes('-d');

      if (!workflowName) {
        console.error('❌ Please specify a workflow name');
        console.log(
          'Usage: npm run ai:workflow run <workflow-name> [--verbose] [--dry-run]'
        );
        process.exit(1);
      }

      await executeWorkflow(workflowName, { verbose, dryRun });
      break;

    case 'help':
    default:
      console.log('🤖 AI Development Workflow Helper\n');
      console.log('Usage:');
      console.log(
        '  npm run ai:workflow list                    # List available workflows'
      );
      console.log(
        '  npm run ai:workflow status                  # Check project status'
      );
      console.log(
        '  npm run ai:workflow run <name> [options]    # Execute workflow'
      );
      console.log('\nOptions:');
      console.log('  --verbose, -v    Show detailed output');
      console.log('  --dry-run, -d    Show commands without executing');
      console.log('\nExample:');
      console.log('  npm run ai:workflow run full-build --verbose');
      break;
  }
}

// Execute if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Workflow failed:', error.message);
    process.exit(1);
  });
}

export { executeWorkflow, WORKFLOWS, getProjectStatus };
