# Contributing to WeChat Article Exporter

First off, thank you for considering contributing to this project! 🎉

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Report Bugs

- Check if the bug has already been reported in [Issues](https://github.com/huangxiding-creator/Auto-wechat-article-exporter/issues)
- If not, create a new issue using the **Bug Report** template
- Include detailed steps to reproduce, expected behavior, and actual behavior

### Suggest Features

- Check existing [Issues](https://github.com/huangxiding-creator/Auto-wechat-article-exporter/issues) for similar suggestions
- Create a new issue using the **Feature Request** template
- Describe the feature and why it would be useful

### Submit Pull Requests

- Fork the repository
- Create a feature branch
- Make your changes
- Submit a pull request

## Development Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/wechat-article-exporter.git
cd wechat-article-exporter

# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Create a branch for your changes
git checkout -b feature/your-feature-name
```

## Project Structure

```text
wechat-article-exporter/
├── .github/
│   ├── ISSUE_TEMPLATE/    # Issue templates
│   ├── workflows/         # GitHub Actions
│   └── VISION.md          # Project vision
├── src/
│   ├── index.ts           # CLI entry point
│   ├── api.ts             # API client
│   ├── browser.ts         # Browser automation
│   ├── downloader.ts      # Download manager
│   └── types.ts           # TypeScript types
├── dist/                  # Compiled JavaScript
├── docs/                  # Documentation
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Coding Standards

### TypeScript

- Use strict TypeScript configuration
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Avoid `any` - use `unknown` when type is truly unknown

### Code Style

- Run `npm run lint` to check for issues
- Run `npm run format` to auto-format code
- Follow the existing code style

### File Naming

- Use camelCase for files: `articleDownloader.ts`
- Use PascalCase for classes: `ArticleDownloader`
- Use camelCase for functions and variables

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```text
feat: add parallel download support
fix(browser): handle timeout errors gracefully
docs: update installation instructions
test(api): add unit tests for getAllArticles
```

## Pull Request Process

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

   - Write clean, documented code
   - Add tests for new functionality
   - Ensure all tests pass: `npm test`
   - Ensure linting passes: `npm run lint`

3. **Commit your changes**

   ```bash
   git commit -m "feat: add your feature description"
   ```

4. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request**

   - Use a clear title and description
   - Reference any related issues
   - Wait for review and address feedback

### PR Checklist

- [ ] Code follows the style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added and passing
- [ ] All tests pass locally

## Questions?

Feel free to open an issue or start a discussion!

Thank you for contributing! 🙏
