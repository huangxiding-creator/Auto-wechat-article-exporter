# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via:

1. **Email**: Send details to [your-email@example.com]
2. **GitHub Security Advisory**: Use [GitHub's private vulnerability reporting](https://github.com/huangxiding-creator/Auto-wechat-article-exporter/security/advisories/new)

### What to Include

Please include the following information:

- Type of vulnerability (e.g., injection, XSS, authentication bypass)
- Full description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Timeframe | Response |
|-----------|----------|
| 24 hours | Acknowledgment of report |
| 72 hours | Initial assessment |
| 7 days | Detailed response with remediation plan |
| 14 days | Patch release (if applicable) |

## Security Best Practices

### When Using This Tool

1. **API Keys**: Keep your API key secure and never commit it to version control
2. **Login Sessions**: The tool stores browser data locally in `.browser-data/`
3. **Data Privacy**: Downloaded articles are stored locally and not transmitted elsewhere
4. **Network**: All communications are over HTTPS

### For Developers

1. **Dependencies**: Run `npm audit` regularly to check for vulnerable dependencies
2. **Secrets**: Never hardcode secrets in source code
3. **Input Validation**: All user inputs are validated
4. **Error Messages**: Error messages do not expose sensitive information

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.2.x   | ✅ Active support |
| 1.1.x   | ⚠️ Security fixes only |
| < 1.0   | ❌ No longer supported |

## Security Features

This tool implements the following security measures:

- [x] No hardcoded secrets in source code
- [x] Input validation for all CLI arguments
- [x] Secure browser automation with Playwright
- [x] Local-only data storage
- [x] HTTPS-only API communication
- [x] Regular dependency security audits

## Known Security Considerations

### Browser Data

The tool uses Playwright's persistent context which stores:
- Browser cookies
- Local storage
- Session data

This data is stored locally in `.browser-data/` directory. If you're using a shared computer, consider:
- Running `rm -rf .browser-data` after use
- Using a dedicated user account

### API Key Validity

API keys obtained through this tool are session-based and may expire. The tool automatically:
- Validates API key before use
- Prompts for re-login if key is invalid
- Does not store API keys persistently

## Attribution

This security policy is based on best practices from:
- [GitHub Security Policy Guidelines](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)

---

Thank you for helping keep WeChat Article Exporter secure! 🛡️
