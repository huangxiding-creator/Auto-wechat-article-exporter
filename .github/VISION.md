# Project Vision: WeChat Article Exporter

## Mission

**一键导出微信公众号所有历史文章，让内容永久保存成为可能。**

## Why This Project?

微信公众号是全球最大的中文内容平台之一，但官方不提供批量导出功能。用户无法：
- 备份自己公众号的所有历史文章
- 批量保存有价值的公众号内容
- 将文章转换为通用的 Markdown 格式

本项目解决了这个痛点。

## Core Value Proposition

| Feature | Benefit |
|---------|---------|
| 🖱️ One-Click Export | 扫码登录后全自动，无需手动操作 |
| 📦 Complete History | 获取所有历史文章，不限页数 |
| 📝 Markdown Format | 通用格式，可在任何工具中使用 |
| 🔄 Resume Support | 断点续传，下载中断可继续 |
| 📚 Smart Merge | 自动合并文章，方便阅读和归档 |

## Target Users

1. **公众号运营者** - 备份自己的内容资产
2. **内容研究者** - 批量收集研究素材
3. **知识管理者** - 将公众号文章纳入个人知识库
4. **AI/LLM 用户** - 准备训练数据或 RAG 知识库

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **Browser Automation**: Playwright
- **HTTP Client**: Axios
- **CLI**: Commander.js
- **Styling**: Chalk (terminal colors)

## Roadmap

### v1.2.0 (Current)
- [x] Browser automation login
- [x] Automatic API key retrieval
- [x] Batch download all articles
- [x] Resume support (skip existing)
- [x] Markdown merge (500 per file)

### v1.3.0 (Next)
- [ ] Parallel downloads with concurrency control
- [ ] Progress bar with ETA
- [ ] Export formats: HTML, PDF
- [ ] Configuration file support

### v2.0.0 (Future)
- [ ] GUI application (Electron)
- [ ] Multiple account support
- [ ] Cloud storage integration
- [ ] Incremental sync

## Success Metrics

| Metric | Target |
|--------|--------|
| GitHub Stars | 1000+ in 3 months |
| NPM Downloads | 500+/week |
| Test Coverage | 80%+ |
| User Issues Response | < 24 hours |

## Open Source Philosophy

- **MIT License** - 最大程度开放
- **English First** - 国际化友好
- **Documentation** - 完善的中英文文档
- **Community** - 欢迎 PR 和 Issue
