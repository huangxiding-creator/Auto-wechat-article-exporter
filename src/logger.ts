/**
 * Logger utility module
 * Provides structured logging with levels and formatting
 */

import * as fs from 'fs'
import * as path from 'path'
import chalk from 'chalk'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LoggerOptions {
  level?: LogLevel
  logFile?: string
  colorize?: boolean
  timestamp?: boolean
}

class Logger {
  private level: LogLevel
  private logFile: string | null
  private colorize: boolean
  private timestamp: boolean

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO
    this.logFile = options.logFile ?? null
    this.colorize = options.colorize ?? true
    this.timestamp = options.timestamp ?? true
  }

  private formatMessage(level: string, message: string): string {
    const ts = this.timestamp ? `[${new Date().toISOString()}] ` : ''
    return `${ts}[${level}] ${message}`
  }

  private writeToFile(formattedMessage: string): void {
    if (this.logFile) {
      const logDir = path.dirname(this.logFile)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      fs.appendFileSync(this.logFile, formattedMessage + '\n', 'utf-8')
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message)
      this.writeToFile(formatted)
      if (this.colorize) {
        console.log(chalk.gray(formatted), ...args)
      } else {
        console.log(formatted, ...args)
      }
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message)
      this.writeToFile(formatted)
      if (this.colorize) {
        console.log(chalk.blue(formatted), ...args)
      } else {
        console.log(formatted, ...args)
      }
    }
  }

  success(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.formatMessage('SUCCESS', message)
      this.writeToFile(formatted)
      if (this.colorize) {
        console.log(chalk.green('✓ ' + message), ...args)
      } else {
        console.log(formatted, ...args)
      }
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      const formatted = this.formatMessage('WARN', message)
      this.writeToFile(formatted)
      if (this.colorize) {
        console.log(chalk.yellow('⚠ ' + message), ...args)
      } else {
        console.log(formatted, ...args)
      }
    }
  }

  error(message: string, error?: Error | unknown): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.formatMessage('ERROR', message)
      this.writeToFile(formatted)
      if (this.colorize) {
        console.log(chalk.red('✗ ' + message))
        if (error) {
          if (error instanceof Error) {
            console.log(chalk.red(`  ${error.message}`))
            if (error.stack) {
              console.log(chalk.gray(error.stack))
            }
          } else {
            console.log(chalk.red(`  ${String(error)}`))
          }
        }
      } else {
        console.log(formatted)
        if (error) {
          console.log(error)
        }
      }
    }
  }

  progress(current: number, total: number, message: string): void {
    if (this.level <= LogLevel.INFO) {
      const percentage = Math.round((current / total) * 100)
      const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5))
      const progressText = `[${current}/${total}] ${bar} ${percentage}%`
      if (this.colorize) {
        console.log(chalk.cyan(`${progressText} ${message}`))
      } else {
        console.log(progressText, message)
      }
    }
  }

  section(title: string): void {
    if (this.level <= LogLevel.INFO) {
      const line = '═'.repeat(50)
      if (this.colorize) {
        console.log(chalk.bold.cyan(`\n╔${line}╗`))
        console.log(chalk.bold.cyan(`║${title.padStart((50 + title.length) / 2).padEnd(50)}║`))
        console.log(chalk.bold.cyan(`╚${line}╝\n`))
      } else {
        console.log(`\n${line}`)
        console.log(title)
        console.log(`${line}\n`)
      }
    }
  }

  table(data: Record<string, unknown>[]): void {
    if (this.level <= LogLevel.INFO) {
      console.table(data)
    }
  }
}

// Default logger instance
export const logger = new Logger({
  level: LogLevel.INFO,
  colorize: true,
  timestamp: false
})

// Factory function for custom loggers
export function createLogger(options: LoggerOptions): Logger {
  return new Logger(options)
}

export default logger
