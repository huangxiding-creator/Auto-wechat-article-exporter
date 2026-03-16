# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2024-03-16

### Added

- Automatic API key retrieval from browser
- Logout before re-login to ensure API key validity
- Smart article merging (500 articles per file)
- New merge file naming: `公众号名称+合并1.md`
- `--merge-only` flag for running only merge operation

### Changed

- Improved pagination to fetch all historical articles
- Better error handling for API requests
- Skip already downloaded articles (resume support)

### Fixed

- API response field mismatch (`articles` instead of `app_msg_list`)
- Article field names (`link` instead of `url`, `author_name` instead of `author`)
- Browser lock conflicts

## [1.1.0] - 2024-03-15

### Added

- Browser automation with Playwright
- QR code login support
- Batch download from account list
- Markdown export with YAML frontmatter

### Changed

- Refactored API client for better error handling

## [1.0.0] - 2024-03-14

### Added

- Initial release
- Basic article download functionality
- Manual API key input mode
- CLI with Commander.js

---

## Release Notes Template

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing features

### Deprecated
- Features to be removed

### Removed
- Features removed

### Fixed
- Bug fixes

### Security
- Security improvements
```
