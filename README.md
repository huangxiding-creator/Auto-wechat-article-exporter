# WeChat Article Exporter

[![npm version](https://badge.fury.io/js/wechat-article-exporter.svg)](https://badge.fury.io/js/wechat-article-exporter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/wechat-article-exporter.svg)](https://nodejs.org)
[![CI](https://github.com/huangxiding-creator/Auto-wechat-article-exporter/workflows/CI/badge.svg)](https://github.com/huangxiding-creator/Auto-wechat-article-exporter/actions)

**One-click export all WeChat official account articles to Markdown.**

<p align="center">
  <img src="docs/demo.gif" alt="Demo" width="600">
</p>

[中文文档](README_CN.md)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Auto Login** | Scan QR code to login, API key retrieved automatically |
| 📥 **Batch Download** | Export ALL historical articles (no page limit) |
| 📝 **Markdown Format** | Clean markdown with YAML frontmatter metadata |
| 🔄 **Resume Support** | Skip already downloaded files, continue anytime |
| 📚 **Smart Merge** | Auto-merge articles (500 per file) for easy reading |
| 🎯 **Precise Matching** | Exact account name matching to avoid errors |

## 🚀 Quick Start

### Prerequisites

- Node.js 18.0 or higher
- npm or yarn

### Installation

```bash
# Install globally
npm install -g wechat-article-exporter

# Or install with npx (no installation needed)
npx wechat-article-exporter
```

### Usage

1. **Create account list file**

   Create `accounts.txt` with one account name per line:

   ```text
   工程豹
   总包说
   ```

2. **Run the exporter**

   ```bash
   wechat-export -a accounts.txt
   ```

3. **Scan QR code**

   A browser window will open automatically. Scan the QR code with WeChat to login.

4. **Wait for completion**

   Articles will be downloaded to `Downloads/` folder automatically.

## 📖 CLI Options

```text
Usage: wechat-export [options]

Options:
  -V, --version              output the version number
  -a, --account-list <file>  account list file (default: "accounts.txt")
  -o, --output <dir>         output directory (default: "Downloads")
  -k, --api-key <key>        API key (optional, auto-retrieved if not provided)
  --manual                   manual API key input mode
  --merge-only               only merge existing articles (skip download)
  -h, --help                 display help for command
```

## 📁 Output Structure

```text
Downloads/
├── AccountName1/
│   ├── 2024-01-01_Article Title.md
│   ├── 2024-01-02_Another Article.md
│   └── merged/
│       └── AccountName1+合并1.md
└── AccountName2/
    └── ...
```

### Article Format

Each article is saved with YAML frontmatter:

```markdown
---
title: Article Title
author: Author Name
date: 2024/1/1 12:00:00
url: https://mp.weixin.qq.com/...
---

# Article Title

Article content here...
```

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/huangxiding-creator/Auto-wechat-article-exporter.git
cd wechat-article-exporter

# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Run in development
npm run dev

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is for personal use only. Please respect copyright and WeChat's terms of service. Do not use for commercial purposes without authorization.

## 🙏 Acknowledgments

- [wechat-article-exporter](https://github.com/wechat-article/wechat-article-exporter) - Original API reference
- [Playwright](https://playwright.dev/) - Browser automation
- [down.mptext.top](https://down.mptext.top/) - API service provider

## 📊 Star History

<p align="center">
  <a href="https://star-history.com/#huangxiding-creator/Auto-wechat-article-exporter&Date">
    <img src="https://api.star-history.com/svg?repos=huangxiding-creator/Auto-wechat-article-exporter&type=Date" alt="Star History Chart">
  </a>
</p>

---

**If this project helps you, please give it a ⭐️!**
