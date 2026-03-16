# 微信公众号文章导出器

[![npm version](https://badge.fury.io/js/wechat-article-exporter.svg)](https://badge.fury.io/js/wechat-article-exporter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/wechat-article-exporter.svg)](https://nodejs.org)

**一键导出微信公众号所有历史文章，让内容永久保存。**

<p align="center">
  <img src="docs/demo.gif" alt="演示" width="600">
</p>

[English](README.md)

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔐 **自动登录** | 扫码登录后自动获取 API 密钥，无需手动操作 |
| 📥 **批量下载** | 导出所有历史文章（不限页数） |
| 📝 **Markdown 格式** | 带 YAML 元数据的干净 Markdown 文件 |
| 🔄 **断点续传** | 跳过已下载文件，随时继续 |
| 📚 **智能合并** | 自动合并文章（每500篇一个文件），方便阅读 |
| 🎯 **精确匹配** | 精确匹配公众号名称，避免错误 |

## 🚀 快速开始

### 环境要求

- Node.js 18.0 或更高版本
- npm 或 yarn

### 安装

```bash
# 全局安装
npm install -g wechat-article-exporter

# 或使用 npx（无需安装）
npx wechat-article-exporter
```

### 使用方法

1. **创建公众号列表文件**

   创建 `accounts.txt`，每行一个公众号名称：

   ```text
   工程豹
   总包说
   ```

2. **运行导出器**

   ```bash
   wechat-export -a accounts.txt
   ```

3. **扫码登录**

   程序会自动打开浏览器窗口，使用微信扫码登录。

4. **等待完成**

   文章会自动下载到 `Downloads/` 目录。

## 📖 命令行选项

```text
Usage: wechat-export [options]

选项:
  -V, --version              显示版本号
  -a, --account-list <file>  公众号列表文件 (默认: "accounts.txt")
  -o, --output <dir>         下载目录 (默认: "Downloads")
  -k, --api-key <key>        API 密钥（可选，不提供则自动获取）
  --manual                   手动输入 API 密钥模式
  --merge-only               仅合并已有文章（不下载）
  -h, --help                 显示帮助信息
```

## 📁 输出结构

```text
Downloads/
├── 公众号名称1/
│   ├── 2024-01-01_文章标题.md
│   ├── 2024-01-02_另一篇文章.md
│   └── merged/
│       └── 公众号名称1+合并1.md
└── 公众号名称2/
    └── ...
```

### 文章格式

每篇文章保存为带 YAML 元数据的 Markdown：

```markdown
---
title: 文章标题
author: 作者名称
date: 2024/1/1 12:00:00
url: https://mp.weixin.qq.com/...
---

# 文章标题

文章内容...
```

## 🔧 开发

```bash
# 克隆仓库
git clone https://github.com/huangxiding-creator/Auto-wechat-article-exporter.git
cd wechat-article-exporter

# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 开发模式运行
npm run dev

# 构建
npm run build

# 测试
npm test

# 代码检查
npm run lint
```

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！请阅读 [贡献指南](CONTRIBUTING.md) 了解详情。

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## ⚠️ 免责声明

本工具仅供个人学习使用。请尊重版权和微信服务条款。未经授权请勿用于商业用途。

## 🙏 致谢

- [wechat-article-exporter](https://github.com/wechat-article/wechat-article-exporter) - 原始 API 参考
- [Playwright](https://playwright.dev/) - 浏览器自动化
- [down.mptext.top](https://down.mptext.top/) - API 服务提供

---

**如果这个项目对你有帮助，请给一个 ⭐️！**
