# 🚀 Deployment Guide - Forge Mutation Tester

Instructions for packaging and distributing the Forge Mutation Tester tool.

## 📋 Table of Contents

- [Preparation](#preparation)
- [NPM Publishing](#npm-publishing)
- [Team Distribution](#team-distribution)
- [GitHub Release](#github-release)
- [Docker Distribution](#docker-distribution)
- [CI/CD Integration](#cicd-integration)
- [Version Management](#version-management)

---

## 🛠️ Preparation

### 1. Pre-deployment Checklist

```bash
# Ensure all files are ready
npm run build          # Build TypeScript to JavaScript
npm test              # Run any tests
npm audit             # Check for vulnerabilities
npm outdated          # Check for outdated dependencies
```

### 2. Update Package Information

Edit `package.json`:
```json
{
  "name": "forge-mutation-tester",
  "version": "1.0.0",
  "author": "Your Name <your.email@domain.com>",
  "repository": {
    "type": "git", 
    "url": "https://github.com/yourusername/forge-mutation-tester.git"
  }
}
```

### 3. Create/Update LICENSE file

```bash
# Add MIT license
cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2024 Your Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
```

---

## 📦 NPM Publishing

### 1. Setup NPM Account

```bash
# Create NPM account at https://www.npmjs.com/signup
# Login to NPM
npm login

# Verify login
npm whoami
```

### 2. Check Package Name Availability

```bash
# Check if name is available
npm view forge-mutation-tester

# If taken, consider alternatives:
# - @yourorg/forge-mutation-tester (scoped package)
# - guardian-mutation-tester 
# - solidity-mutation-tester
```

### 3. Prepare for Publishing

```bash
# Build the project
npm run build

# Test the package locally
npm pack
npm install -g forge-mutation-tester-1.0.0.tgz

# Test the CLI
forge-mutation-tester --help

# Clean up
npm uninstall -g forge-mutation-tester
rm forge-mutation-tester-1.0.0.tgz
```

### 4. Publish to NPM

```bash
# First time publish
npm publish

# For subsequent versions
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.0 -> 1.1.0  
npm version major   # 1.0.0 -> 2.0.0
npm publish

# For scoped packages (if needed)
npm publish --access public
```

### 5. Verify Publication

```bash
# Check package on NPM
npm view forge-mutation-tester

# Test installation
npm install -g forge-mutation-tester
forge-mutation-tester --help
```

---

## 👥 Team Distribution

### Option 1: Private NPM Registry

```bash
# Setup .npmrc for private registry
echo "@yourcompany:registry=https://npm.yourcompany.com/" > .npmrc

# Publish privately
npm publish
```

### Option 2: GitHub Packages

```bash
# Setup .npmrc for GitHub packages
echo "@yourusername:registry=https://npm.pkg.github.com" > .npmrc

# Update package.json name to be scoped
"name": "@yourusername/forge-mutation-tester"

# Publish to GitHub packages
npm publish
```

### Option 3: Direct Installation from Git

```bash
# Team members can install directly from Git
npm install -g git+https://github.com/yourusername/forge-mutation-tester.git

# Or from specific branch/tag
npm install -g git+https://github.com/yourusername/forge-mutation-tester.git#v1.0.0
```

### Option 4: Tarball Distribution

```bash
# Create distributable tarball
npm pack

# Share the .tgz file with team
# They can install with:
npm install -g forge-mutation-tester-1.0.0.tgz
```

---

## 🏷️ GitHub Release

### 1. Create GitHub Release

```bash
# Tag the version
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# Create release on GitHub with:
# - Release notes
# - Changelog
# - Binary attachments (optional)
```

### 2. Automated Release with GitHub Actions

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Publish to NPM
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            *.tgz
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 🐳 Docker Distribution

### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

# Install system dependencies for Gambit
RUN apk add --no-cache \
    git \
    python3 \
    py3-pip \
    rust \
    cargo \
    build-base

# Install solc-select
RUN pip3 install solc-select

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/
COPY README.md USAGE.md ./

# Create global symlink
RUN npm link

# Set working directory for user
WORKDIR /workspace

# Default command
CMD ["forge-mutation-tester", "--help"]
```

### 2. Build and Publish Docker Image

```bash
# Build image
docker build -t forge-mutation-tester:latest .

# Test locally
docker run --rm -v $(pwd):/workspace forge-mutation-tester:latest --help

# Tag for registry
docker tag forge-mutation-tester:latest yourusername/forge-mutation-tester:latest
docker tag forge-mutation-tester:latest yourusername/forge-mutation-tester:1.0.0

# Push to Docker Hub
docker push yourusername/forge-mutation-tester:latest
docker push yourusername/forge-mutation-tester:1.0.0
```

### 3. Docker Usage

```bash
# Run mutation testing in Docker
docker run --rm -v $(pwd):/workspace \
  -e OPENAI_API_KEY="your-key" \
  yourusername/forge-mutation-tester:latest \
  run -r https://github.com/user/repo
```

---

## ⚙️ CI/CD Integration

### GitHub Actions Example

`.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Test CLI
        run: |
          npm link
          forge-mutation-tester --help
```

### Usage in Team CI/CD

```yaml
# Add to your project's CI to run mutation testing
- name: Run Mutation Testing
  run: |
    npm install -g forge-mutation-tester
    forge-mutation-tester run -r ${{ github.repository }}
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 📊 Version Management

### Semantic Versioning

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backward compatible  
- **PATCH** (0.0.1): Bug fixes, backward compatible

### Release Process

```bash
# 1. Update CHANGELOG.md
# 2. Update version
npm version minor  # or patch/major

# 3. Push changes
git push origin main --tags

# 4. Publish
npm publish

# 5. Create GitHub release
# 6. Update documentation
```

### Maintenance Branches

```bash
# For major version maintenance
git checkout -b maintenance/v1.x
git push -u origin maintenance/v1.x

# For hotfixes
git checkout -b hotfix/v1.0.1 maintenance/v1.x
# Make fixes
git checkout maintenance/v1.x
git merge hotfix/v1.0.1
npm version patch
npm publish
```

---

## 🔒 Security Considerations

### 1. Environment Variables

```bash
# Never commit API keys
echo ".env" >> .gitignore
echo "*.env" >> .gitignore

# Use GitHub Secrets for CI/CD
# Use npm config for publishing
npm config set //registry.npmjs.org/:_authToken $NPM_TOKEN
```

### 2. Dependency Security

```bash
# Regular security audits
npm audit
npm audit fix

# Use exact versions in package-lock.json
npm ci  # instead of npm install in CI
```

### 3. Access Control

```bash
# Use 2FA for NPM account
npm profile enable-2fa auth-and-writes

# Limit package access
npm owner ls forge-mutation-tester
npm owner add username forge-mutation-tester
```

---

## 📈 Monitoring & Analytics

### NPM Statistics

```bash
# Check download stats
npm info forge-mutation-tester

# View on npm website
# https://www.npmjs.com/package/forge-mutation-tester
```

### Usage Analytics

Consider adding optional telemetry:
- Usage patterns
- Error reporting  
- Performance metrics
- Feature adoption

---

## 🎯 Distribution Strategy

### Public Release

1. **NPM Registry**: Global availability
2. **GitHub Releases**: Version management
3. **Documentation**: Comprehensive guides
4. **Community**: Discord/Telegram support

### Team/Enterprise

1. **Private Registry**: Internal distribution
2. **Docker Images**: Containerized deployment
3. **CI/CD Integration**: Automated testing
4. **Training**: Team onboarding

---

**Ready to deploy? Choose your distribution method and follow the relevant section above!** 🚀 