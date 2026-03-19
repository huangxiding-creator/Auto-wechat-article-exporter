/**
 * Internationalization (i18n) module
 * Supports Chinese and English
 */

type Locale = 'zh' | 'en'
type TranslationKey = keyof typeof translations

const translations = {
  // CLI general
  cli: {
    title: {
      zh: '微信公众号文章批量下载器',
      en: 'WeChat Article Exporter'
    },
    version: {
      zh: '版本',
      en: 'Version'
    }
  },

  // Login
  login: {
    scanning: {
      zh: '请在浏览器中扫描二维码登录公众号...',
      en: 'Please scan QR code in browser to login...'
    },
    waiting: {
      zh: '等待登录完成（最多等待3分钟）...',
      en: 'Waiting for login (max 3 minutes)...'
    },
    clickButton: {
      zh: '已点击登录按钮，请扫描二维码...',
      en: 'Login button clicked, please scan QR code...'
    },
    success: {
      zh: '登录成功！',
      en: 'Login successful!'
    },
    detected: {
      zh: '检测到已登录状态',
      en: 'Detected logged in state'
    }
  },

  // API Key
  apiKey: {
    getting: {
      zh: '正在自动获取 API 密钥...',
      en: 'Getting API key automatically...'
    },
    navigating: {
      zh: '正在导航到 API 页面...',
      en: 'Navigating to API page...'
    },
    clicked: {
      zh: '已点击查询 API 密钥按钮',
      en: 'Query API key button clicked'
    },
    success: {
      zh: 'API 密钥获取成功',
      en: 'API key retrieved successfully'
    },
    invalid: {
      zh: '错误: API 密钥无效',
      en: 'Error: Invalid API key'
    }
  },

  // Browser
  browser: {
    initializing: {
      zh: '正在初始化浏览器...',
      en: 'Initializing browser...'
    },
    logout: {
      zh: '正在清除登录状态以确保获取新的 API 密钥...',
      en: 'Clearing login state to ensure fresh API key...'
    },
    logoutSuccess: {
      zh: '已点击退出登录按钮',
      en: 'Logout button clicked'
    },
    clearingCookies: {
      zh: '未找到退出按钮，尝试清除登录 cookies...',
      en: 'Logout button not found, clearing login cookies...'
    }
  },

  // Download
  download: {
    starting: {
      zh: '开始批量下载微信公众号文章',
      en: 'Starting batch download'
    },
    target: {
      zh: '目标公众号',
      en: 'Target accounts'
    },
    outputDir: {
      zh: '下载目录',
      en: 'Output directory'
    },
    searching: {
      zh: '搜索公众号',
      en: 'Searching account'
    },
    found: {
      zh: '找到公众号',
      en: 'Found account'
    },
    notFound: {
      zh: '未找到公众号',
      en: 'Account not found'
    },
    gettingList: {
      zh: '获取文章列表...',
      en: 'Getting article list...'
    },
    paginationStart: {
      zh: '开始分页获取文章...',
      en: 'Starting pagination...'
    },
    articlesFound: {
      zh: '获取到',
      en: 'Retrieved'
    },
    articlesUnit: {
      zh: '篇文章',
      en: 'articles'
    },
    skipExisting: {
      zh: '跳过已存在',
      en: 'Skip existing'
    },
    downloadSuccess: {
      zh: '完成! 成功',
      en: 'Done! Success'
    },
    downloadFailed: {
      zh: '失败',
      en: 'Failed'
    }
  },

  // Merge
  merge: {
    starting: {
      zh: '开始合并 Markdown 文件',
      en: 'Starting Markdown merge'
    },
    processing: {
      zh: '处理公众号',
      en: 'Processing account'
    },
    filesFound: {
      zh: '找到',
      en: 'Found'
    },
    mdFiles: {
      zh: '个 Markdown 文件',
      en: 'Markdown files'
    },
    noFiles: {
      zh: '没有 Markdown 文件需要合并',
      en: 'No Markdown files to merge'
    },
    willMergeTo: {
      zh: '将合并为',
      en: 'Will merge into'
    },
    files: {
      zh: '个文件',
      en: 'files'
    },
    deletingOld: {
      zh: '删除',
      en: 'Deleting'
    },
    oldMerged: {
      zh: '个旧的合并文件...',
      en: 'old merged files...'
    },
    mergingBatch: {
      zh: '合并第',
      en: 'Merging batch'
    },
    batchOf: {
      zh: '批',
      en: 'of'
    },
    created: {
      zh: '已创建',
      en: 'Created'
    },
    complete: {
      zh: '合并完成！',
      en: 'Merge complete!'
    }
  },

  // Summary
  summary: {
    title: {
      zh: '下载汇总',
      en: 'Download Summary'
    },
    total: {
      zh: '总计',
      en: 'Total'
    },
    articles: {
      zh: '篇文章',
      en: 'articles'
    },
    savedTo: {
      zh: '文章已保存到',
      en: 'Articles saved to'
    },
    allComplete: {
      zh: '全部完成！',
      en: 'All done!'
    }
  },

  // Errors
  errors: {
    accountListNotFound: {
      zh: '错误: 找不到公众号名称列表文件',
      en: 'Error: Account list file not found'
    },
    accountListEmpty: {
      zh: '错误: 公众号名称列表为空',
      en: 'Error: Account list is empty'
    },
    browserNotInit: {
      zh: '浏览器未初始化',
      en: 'Browser not initialized'
    },
    apiKeyNotFound: {
      zh: '无法获取 API 密钥，请确保已正确登录',
      en: 'Cannot get API key, please ensure login is correct'
    },
    apiKeyNotProvided: {
      zh: '错误: 未提供 API 密钥',
      en: 'Error: API key not provided'
    },
    pleaseCreateFile: {
      zh: '请创建一个包含公众号名称的文本文件（每行一个名称）',
      en: 'Please create a text file with account names (one per line)'
    },
    defaultFilePath: {
      zh: '默认文件路径',
      en: 'Default file path'
    }
  },

  // Manual mode
  manual: {
    title: {
      zh: '手动输入 API 密钥模式',
      en: 'Manual API Key Input Mode'
    },
    instructions: {
      zh: '请按照以下步骤获取 API 密钥',
      en: 'Please follow these steps to get API key'
    },
    step1: {
      zh: '打开浏览器访问',
      en: 'Open browser and visit'
    },
    step2: {
      zh: '点击 "登录公众号" 并扫码登录',
      en: 'Click "Login" and scan QR code'
    },
    step3: {
      zh: '登录成功后访问',
      en: 'After login, visit'
    },
    step4: {
      zh: '点击 "查询 API 密钥" 按钮',
      en: 'Click "Query API Key" button'
    },
    step5: {
      zh: '复制显示的 API 密钥',
      en: 'Copy the displayed API key'
    },
    prompt: {
      zh: '请粘贴 API 密钥',
      en: 'Please paste API key'
    }
  }
}

/**
 * Get translation for a key
 */
export function t(key: string, locale: Locale = 'zh'): string {
  const keys = key.split('.')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = translations

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k]
    } else {
      return key // Return key if not found
    }
  }

  if (typeof value === 'object' && locale in value) {
    return value[locale]
  }

  return typeof value === 'string' ? value : key
}

/**
 * Detect system locale
 */
export function detectLocale(): Locale {
  const envLang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || ''
  const systemLang = (envLang.split('_')[0] || '').toLowerCase()

  if (systemLang === 'zh' || systemLang.startsWith('zh')) {
    return 'zh'
  }
  return 'en'
}

/**
 * Create a translator with bound locale
 */
export function createTranslator(locale?: Locale) {
  const resolvedLocale = locale || detectLocale()
  return (key: string) => t(key, resolvedLocale)
}

export type { Locale, TranslationKey }
