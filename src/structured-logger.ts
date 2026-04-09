/**
 * 结构化日志系统
 * 支持不同日志级别、格式化和文件输出
 */

import * as fs from 'fs'
import * as path from 'path'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
  context?: Record<string, unknown>
  duration?: number
}

export interface LoggerConfig {
  level: LogLevel
  logDir: string
  maxFileSize: number    // 最大文件大小（字节）
  maxFiles: number       // 保留的最大文件数
  console: boolean       // 是否输出到控制台
  file: boolean          // 是否输出到文件
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  logDir: 'logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  console: true,
  file: true
}

class StructuredLogger {
  private config: LoggerConfig
  private currentLogFile: string | null = null
  private logStream: fs.WriteStream | null = null

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    if (this.config.file) {
      this.initLogFile()
    }
  }

  private initLogFile(): void {
    const logDir = this.config.logDir

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const today = new Date().toISOString().split('T')[0]
    this.currentLogFile = path.join(logDir, `download-${today}.log`)

    // 检查文件大小，如果太大则轮转
    if (fs.existsSync(this.currentLogFile)) {
      const stats = fs.statSync(this.currentLogFile)
      if (stats.size >= this.config.maxFileSize) {
        this.rotateLogFiles()
      }
    }
  }

  private rotateLogFiles(): void {
    if (!this.currentLogFile) return

    // 删除最旧的文件
    const logDir = this.config.logDir
    const files = fs.readdirSync(logDir)
      .filter(f => f.startsWith('download-') && f.endsWith('.log'))
      .sort()

    while (files.length >= this.config.maxFiles) {
      const oldestFile = files.shift()
      if (oldestFile) {
        fs.unlinkSync(path.join(logDir, oldestFile))
      }
    }

    // 重命名当前文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const newFile = this.currentLogFile.replace('.log', `-${timestamp}.log`)
    fs.renameSync(this.currentLogFile, newFile)
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext = error instanceof Error
      ? { error: error.message, stack: error.stack, ...context }
      : { error: String(error), ...context }
    this.log(LogLevel.ERROR, message, errorContext)
  }

  /**
   * 记录性能指标
   */
  metric(name: string, value: number, unit: string = 'ms', context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, `[METRIC] ${name}`, {
      metric: { name, value, unit },
      ...context
    })
  }

  /**
   * 创建定时器
   */
  startTimer(): () => number {
    const start = Date.now()
    return () => Date.now() - start
  }

  /**
   * 记录操作耗时
   */
  async time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const timer = this.startTimer()
    try {
      const result = await fn()
      const duration = timer()
      this.metric(operation, duration, 'ms', { status: 'success' })
      return result
    } catch (error) {
      const duration = timer()
      this.metric(operation, duration, 'ms', { status: 'error' })
      throw error
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.config.level) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      context
    }

    const logLine = this.formatLogEntry(entry)

    // 控制台输出
    if (this.config.console) {
      this.consoleOutput(level, logLine)
    }

    // 文件输出
    if (this.config.file && this.currentLogFile) {
      this.fileOutput(logLine)
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
    return `[${entry.timestamp}] [${entry.level}] ${entry.message}${contextStr}\n`
  }

  private consoleOutput(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        // eslint-disable-next-line no-console
        console.log('\x1b[90m%s\x1b[0m', message.trim())
        break
      case LogLevel.INFO:
        // eslint-disable-next-line no-console
        console.log('\x1b[36m%s\x1b[0m', message.trim())
        break
      case LogLevel.WARN:
        // eslint-disable-next-line no-console
        console.warn('\x1b[33m%s\x1b[0m', message.trim())
        break
      case LogLevel.ERROR:
        // eslint-disable-next-line no-console
        console.error('\x1b[31m%s\x1b[0m', message.trim())
        break
    }
  }

  private fileOutput(message: string): void {
    if (this.currentLogFile) {
      fs.appendFileSync(this.currentLogFile, message, 'utf-8')
    }
  }

  /**
   * 获取最近的日志条目
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    if (!this.currentLogFile || !fs.existsSync(this.currentLogFile)) {
      return []
    }

    const content = fs.readFileSync(this.currentLogFile, 'utf-8')
    const lines = content.trim().split('\n').slice(-count)

    return lines.map(line => {
      const match = line.match(/\[([^\]]+)\] \[([^\]]+)\] (.+)/)
      if (match) {
        return {
          timestamp: match[1] || '',
          level: match[2] || '',
          message: match[3] || ''
        }
      }
      return { timestamp: '', level: '', message: line }
    })
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level
  }

  /**
   * 关闭日志
   */
  close(): void {
    if (this.logStream) {
      this.logStream.end()
      this.logStream = null
    }
  }
}

// 导出单例实例
export const logger = new StructuredLogger({
  level: process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
  logDir: 'logs'
})

export { StructuredLogger }
