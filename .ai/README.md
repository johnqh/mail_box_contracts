# Mailer Multi-Chain - AI Development Resources

This directory contains specialized resources designed to optimize AI-assisted development of the Mailer multi-chain messaging system.

## 📁 Directory Structure

```
.ai/
├── README.md                    # This file - overview of AI resources
├── QUICK_REFERENCE.md          # Fast lookup for commands and patterns
├── context/
│   └── project-summary.md      # High-level project context for AI
├── snippets/
│   └── common-patterns.ts      # Copy-paste code patterns
└── patterns/
    └── testing-patterns.md     # Comprehensive testing approaches
```

## 🎯 Purpose

These resources are specifically designed for AI assistants to:

- **Understand the project quickly** with concise context
- **Follow established patterns** for consistent code quality
- **Find solutions fast** with ready-to-use code snippets
- **Implement tests correctly** with proven patterns
- **Debug efficiently** with common issue solutions

## 🚀 Quick Start for AI

### 1. Read Project Context First

Start with `context/project-summary.md` to understand:

- What the project does (multi-chain messaging)
- How it works (automatic chain detection)
- Current status (production-ready)
- Key files and their purposes

### 2. Use Quick Reference for Commands

`QUICK_REFERENCE.md` provides:

- Essential commands (`npm run compile`, `npm test`, etc.)
- File locations and purposes
- Common debugging solutions
- Critical patterns to follow

### 3. Copy Patterns from Snippets

`snippets/common-patterns.ts` contains:

- Unified client usage examples
- Dynamic import patterns
- Error handling templates
- Configuration structures
- Testing setups

### 4. Follow Testing Patterns

`patterns/testing-patterns.md` shows:

- How to structure tests for each chain
- Mock setup patterns
- Assertion patterns
- Integration test approaches

## 🧠 Key Concepts for AI Understanding

### Automatic Chain Detection

```typescript
// The system automatically detects wallet type and routes accordingly
const client = new OnchainMailerClient(anyWallet, config);
// No need to specify chain - it's detected from wallet properties
```

### Dynamic Module Loading

```typescript
// Chain-specific code is loaded only when needed
// EVM modules loaded only for EVM wallets
// Solana modules loaded only for Solana wallets
```

### Unified API Surface

```typescript
// Same methods work on all chains - implementation differs internally
await client.sendMessage(subject, body, priority);  // Works on EVM and Solana
await client.delegateTo(address);  // Address validated per chain
await client.claimRevenue();  // Chain-specific implementation
```

## 🛠️ Development Workflow for AI

### When Making Changes

1. **Understand the change scope** (single chain vs multi-chain vs unified API)
2. **Follow the appropriate pattern** from snippets/
3. **Test thoroughly** using patterns from patterns/
4. **Update documentation** if API changes

### Critical Commands to Remember

```bash
npm run compile    # Always run after contract changes (regenerates types)
npm run build      # Build all TypeScript (EVM + Solana + Unified)
npm test          # Run all tests (105 EVM + unified client tests)
```

### Error Patterns to Watch For

- **TypeScript errors after contract changes** → Run `npm run compile`
- **Import path issues** → Use relative imports consistently
- **Wallet detection failures** → Check wallet properties and detection logic
- **Network timeouts** → Add timeout protection to operations

## 📊 Success Metrics

### The AI development environment is working when

- ✅ New features can be added following established patterns
- ✅ Tests provide clear feedback on breaking changes
- ✅ Documentation enables self-service development
- ✅ Error messages guide developers to solutions
- ✅ Examples demonstrate real-world usage patterns

### Performance Indicators

- Code follows established patterns (no reinventing wheels)
- Error handling is comprehensive and specific
- Tests cover both success and failure scenarios
- Documentation stays up-to-date with code changes

## 🎯 AI-Specific Guidelines

### What to Always Do

- ✅ Use dynamic imports for chain-specific code
- ✅ Add timeout protection to network operations
- ✅ Validate addresses before operations
- ✅ Cache modules for performance
- ✅ Provide specific error messages
- ✅ Follow existing naming conventions

### What to Avoid

- ❌ Static imports of heavy chain-specific modules
- ❌ Generic error messages without context
- ❌ Operations without proper validation
- ❌ Network calls without timeouts
- ❌ Breaking existing API patterns

### Code Quality Checklist

- [ ] Follows established patterns from snippets/
- [ ] Has appropriate error handling
- [ ] Includes timeout protection for network ops
- [ ] Validates inputs properly
- [ ] Is consistent with existing code style
- [ ] Has comprehensive tests
- [ ] Updates documentation as needed

## 🔄 Maintenance

### Keep Resources Updated

When the codebase evolves:

1. Update `context/project-summary.md` with new capabilities
2. Add new patterns to `snippets/common-patterns.ts`
3. Update `QUICK_REFERENCE.md` with new commands/files
4. Expand `patterns/testing-patterns.md` with new test scenarios

### Resource Feedback Loop

These AI resources should evolve based on:

- Common questions from AI development sessions
- Patterns that emerge from successful implementations
- Issues that arise repeatedly
- New features added to the system

This directory is a living resource that grows with the project to maintain optimal AI development experience.
