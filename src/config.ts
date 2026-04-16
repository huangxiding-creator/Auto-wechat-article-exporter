/**
 * 统一配置管理
 * 支持环境变量覆盖和配置文件
 */

import * as fs from 'fs'
import * as path from 'path'

export interface AppConfig {
  // API 配置
  api: {
    baseUrl: string
    timeout: number
    maxRetries: number
    baseDelay: number
    maxDelay: number
  }
  // 下载配置
  download: {
    concurrency: number
    mergeSize: number
    downloadDir: string
    mergeDir: string
    recordFile: string
  }
  // 速率限制
  rateLimit: {
    maxRequests: number
    windowMs: number
    minDelay: number
    maxDelay: number
  }
  // 断路器
  circuitBreaker: {
    failureThreshold: number
    successThreshold: number
    timeout: number
  }
  // 日志
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    logDir: string
    console: boolean
  }
  // 通知
  notification: {
    webhookUrl: string | null
    enabled: boolean
  }
}

const DEFAULT_CONFIG: AppConfig = {
  api: {
    baseUrl: 'https://down.mptext.top',
    timeout: 30000,
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000
  },
  download: {
    concurrency: 5,
    mergeSize: 300,
    downloadDir: 'Downloads',
    mergeDir: 'Merge',
    recordFile: '.download-record.json'
  },
  rateLimit: {
    maxRequests: 30,
    windowMs: 60000,
    minDelay: 300,
    maxDelay: 30000
  },
  circuitBreaker: {
    failureThreshold: 15,
    successThreshold: 3,
    timeout: 120000
  },
  logging: {
    level: 'info',
    logDir: 'logs',
    console: true
  },
  notification: {
    webhookUrl: null,
    enabled: false
  }
}

class ConfigManager {
  private config: AppConfig
  private configPath: string

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'wechat-exporter.config.json')
    this.config = this.loadConfig()
  }

  /**
   * 加载配置（优先级：环境变量 > 配置文件 > 默认值）
   */
  private loadConfig(): AppConfig {
    let config = { ...DEFAULT_CONFIG }

    // 尝试从配置文件加载
    if (fs.existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
        config = this.mergeDeep(config, fileConfig)
      } catch {
        // 忽略配置文件错误
      }
    }

    // 环境变量覆盖
    config = this.applyEnvOverrides(config)

    return config
  }

  /**
   * 应用环境变量覆盖
   */
  private applyEnvOverrides(config: AppConfig): AppConfig {
    const env = process.env

    if (env.API_BASE_URL) {
      config.api.baseUrl = env.API_BASE_URL
    }
    if (env.API_TIMEOUT) {
      config.api.timeout = parseInt(env.API_TIMEOUT, 10)
    }
    if (env.DOWNLOAD_CONCURRENCY) {
      config.download.concurrency = parseInt(env.DOWNLOAD_CONCURRENCY, 10)
    }
    if (env.MERGE_SIZE) {
      config.download.mergeSize = parseInt(env.MERGE_SIZE, 10)
    }
    if (env.RATE_LIMIT_MAX) {
      config.rateLimit.maxRequests = parseInt(env.RATE_LIMIT_MAX, 10)
    }
    if (env.LOG_LEVEL) {
      config.logging.level = env.LOG_LEVEL as AppConfig['logging']['level']
    }
    if (env.WEBHOOK_URL) {
      config.notification.webhookUrl = env.WEBHOOK_URL
      config.notification.enabled = true
    }

    return config
  }

  /**
   * 深度合并对象
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mergeDeep<T>(target: T, source: Partial<T>): T {
    const result = { ...target } as T
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key]
        const targetValue = (target as any)[key]
        if (sourceValue !== undefined) {
          if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
              targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
            (result as any)[key] = this.mergeDeep(targetValue, sourceValue as Partial<typeof targetValue>)
          } else {
            (result as any)[key] = sourceValue
          }
        }
      }
    }
    return result
  }

  /**
   * 获取配置
   */
  get(): AppConfig {
    return { ...this.config }
  }

  /**
   * 获取部分配置
   */
  getSection<K extends keyof AppConfig>(section: K): AppConfig[K] {
    return { ...this.config[section] }
  }

  /**
   * 更新配置
   */
  update(updates: Partial<AppConfig>): void {
    this.config = this.mergeDeep(this.config, updates)
  }

  /**
   * 保存配置到文件
   */
  save(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG }
  }
}

// 导出单例
export const config = new ConfigManager()
export { ConfigManager }
