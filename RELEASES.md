# 🚀 Release Management Guide

This document explains how to create releases for the MailBox Contracts TypeScript client library.

## 📦 What Gets Published

When you create a release, the following packages are automatically published:

1. **NPM Package**: `mail_box_contracts` - TypeScript client library
2. **Docker Image**: `{DOCKERHUB_USERNAME}/mail_box_contracts` - Containerized version
3. **GitHub Release**: Tagged release with auto-generated changelog

## 🏷️ Creating a Release

### Method 1: Git Tag (Recommended)

```bash
# Ensure you're on the main branch with latest changes
git checkout main
git pull origin main

# Create and push a version tag
git tag v1.2.0
git push origin v1.2.0
```

This will automatically trigger the release workflow.

### Method 2: GitHub UI Manual Dispatch

1. Go to **Actions** → **Release TypeScript Client Library**
2. Click **Run workflow**
3. Enter the version tag (e.g., `v1.2.0`)
4. Click **Run workflow**

## 📋 Release Workflow Steps

The automated release process includes:

### 1. **Quality Gates** ✅
- Run full test suite (81 tests)
- Compile contracts
- Build TypeScript library
- Security audit (npm audit)
- Verify build artifacts

### 2. **NPM Publishing** 📦
- Extract version from git tag
- Update package.json version
- Build production artifacts
- Publish to npm registry
- Verify publication

### 3. **Docker Publishing** 🐳
- Build multi-architecture images (AMD64, ARM64)
- Tag with version and latest
- Push to Docker Hub
- Verify image functionality

### 4. **GitHub Release** 📋
- Auto-generate changelog from commits
- Create release notes
- Attach build artifacts
- Link to npm and Docker packages

### 5. **Post-Release Validation** ✅
- Verify npm package availability
- Test Docker image functionality
- Generate release summary

## 📝 Version Guidelines

### Semantic Versioning
- **Major (x.0.0)**: Breaking changes, contract interface changes
- **Minor (1.x.0)**: New features, backward compatible
- **Patch (1.1.x)**: Bug fixes, security patches

### Examples:
```bash
v1.0.0  # Initial release
v1.1.0  # Added new messaging features
v1.1.1  # Security fix
v2.0.0  # Breaking contract changes
```

## 🔧 Pre-Release Checklist

Before creating a release, ensure:

- [ ] All tests pass locally: `npm test`
- [ ] Contracts compile: `npm run compile`  
- [ ] TypeScript builds: `npm run build`
- [ ] Security audit clean: `npm audit`
- [ ] Version in package.json is correct
- [ ] CHANGELOG or commit messages describe changes
- [ ] Breaking changes documented

## 🔑 Required Secrets

The GitHub Actions workflow requires these repository secrets:

```bash
# Required for npm publishing
NPM_TOKEN=npm_xxxxxxxxxxxxxxxx

# Required for Docker Hub
DOCKERHUB_USERNAME=your_dockerhub_username
DOCKERHUB_TOKEN=dckr_pat_xxxxxxxxxxxxxxxx

# Provided automatically by GitHub
GITHUB_TOKEN=(auto-generated)
```

### Setting up NPM_TOKEN:
1. Login to npmjs.com
2. Go to Access Tokens → Generate New Token
3. Choose "Publish" scope
4. Copy token and add to GitHub repository secrets

### Setting up DOCKERHUB_TOKEN:
1. Login to Docker Hub
2. Go to Account Settings → Personal Access Tokens
3. Create new token with appropriate permissions
4. Add both username and token to GitHub secrets

## 📊 Monitoring Releases

### GitHub Actions:
- View release progress: `https://github.com/{owner}/{repo}/actions`
- Check workflow logs for any issues
- Monitor each stage: Test → Audit → Publish → Release

### NPM Package:
- Verify publication: `https://www.npmjs.com/package/mail_box_contracts`
- Check version availability: `npm view mail_box_contracts@{version}`
- Test installation: `npm install mail_box_contracts@{version}`

### Docker Hub:
- Verify image: `https://hub.docker.com/r/{username}/mail_box_contracts`
- Pull and test: `docker pull {username}/mail_box_contracts:{version}`

## 🚨 Troubleshooting

### Release Failed:
1. Check GitHub Actions logs
2. Verify all secrets are set correctly
3. Ensure package.json version matches tag
4. Check for npm registry issues

### NPM Publication Failed:
- Verify NPM_TOKEN has publish permissions
- Check if version already exists
- Ensure package name is available

### Docker Build Failed:
- Check Dockerfile syntax
- Verify DOCKERHUB credentials
- Review build context and dependencies

### Common Issues:
```bash
# Version already exists
npm ERR! 403 Forbidden - PUT https://registry.npmjs.org/mail_box_contracts

# Solution: Use a new version number

# Docker authentication failed
Error response from daemon: unauthorized

# Solution: Verify DOCKERHUB_TOKEN is valid
```

## 🎯 Best Practices

1. **Test Locally First**: Always verify builds work locally
2. **Follow SemVer**: Use semantic versioning consistently  
3. **Document Changes**: Clear commit messages help auto-generate changelogs
4. **Monitor Releases**: Check that packages are available after release
5. **Security First**: Run security audits before releasing

## 📞 Support

If you encounter issues with the release process:
1. Check the workflow logs in GitHub Actions
2. Review this documentation
3. Open an issue with the error details
4. Tag maintainers for urgent release issues

---

**Happy Releasing! 🚀**