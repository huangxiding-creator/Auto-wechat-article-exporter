/**
 * 微信公众号文章导出器 - 下载管理器
 */

import * as fs from 'fs'
import * as path from 'path'
import { WeChatAPI } from './api'
import { AccountInfo, Article } from './types'
import { NotificationService, DownloadResult } from './notification'
import chalk from 'chalk'
import ora from 'ora'

const MERGE_SIZE = 300 // 每300个文件合并为一个
const DOWNLOAD_RECORD_FILE = '.download-record.json' // 下载记录文件
const MERGE_RECORD_FILE = '.merge-record.json' // 合并记录文件
const DEFAULT_WEBHOOK_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=f543f393-4e15-42f9-90eb-d4b8510e3ba6'

interface DownloadStats {
  total: number
  downloaded: number
  failed: number
  mergedFiles: number
  mergedSize: string
  duration: number
}

interface DownloadRecord {
  accountName: string
  downloadedArticles: Set<string>
  lastUpdateTime: string
}

interface AccountMergeRecord {
  mergedFiles: Set<string>  // 已合并的文件名
  lastMergeIndex: number    // 最后一个合并文件的序号
  lastMergeCount: number    // 最后一个合并文件中的文章数
}

interface MergeRecordData {
  [accountName: string]: {
    mergedFiles: string[]
    lastMergeIndex: number
    lastMergeCount: number
  }
}

export class ArticleDownloader {
  private api: WeChatAPI
  private downloadDir: string
  private notification: NotificationService
  private downloadRecords: Map<string, DownloadRecord> = new Map()
  private mergeRecords: Map<string, AccountMergeRecord> = new Map()
  private mergedDir: string
  private progressTimer: ReturnType<typeof setInterval> | null = null
  private downloadStartTime: number = 0
  private totalDownloadedArticles: number = 0
  private totalSkippedArticles: number = 0
  private totalFailedArticles: number = 0
  private currentAccountName: string = ''
  private currentAccountProgress: string = ''

  constructor(apiKey: string, downloadDir: string, webhookUrl?: string) {
    this.api = new WeChatAPI(apiKey)
    this.downloadDir = downloadDir
    this.notification = new NotificationService(webhookUrl || DEFAULT_WEBHOOK_URL)
    this.mergedDir = path.join(path.dirname(downloadDir), 'Merge')

    // 确保下载目录存在
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }

    // 加载下载记录
    this.loadDownloadRecords()
    // 加载合并记录
    this.loadMergeRecords()
  }

  /**
   * 加载下载记录
   */
  private loadDownloadRecords(): void {
    const recordPath = path.join(this.downloadDir, DOWNLOAD_RECORD_FILE)
    try {
      if (fs.existsSync(recordPath)) {
        const data = JSON.parse(fs.readFileSync(recordPath, 'utf-8'))
        for (const [accountName, record] of Object.entries(data)) {
          const r = record as { downloadedArticles: string[], lastUpdateTime: string }
          this.downloadRecords.set(accountName, {
            accountName,
            downloadedArticles: new Set(r.downloadedArticles),
            lastUpdateTime: r.lastUpdateTime
          })
        }
        console.log(chalk.gray(`  已加载下载记录: ${this.downloadRecords.size} 个公众号`))
      }
    } catch (error) {
      console.log(chalk.yellow('  加载下载记录失败，将创建新记录'))
    }
  }

  /**
   * 保存下载记录
   */
  private saveDownloadRecords(): void {
    const recordPath = path.join(this.downloadDir, DOWNLOAD_RECORD_FILE)
    try {
      const data: Record<string, { downloadedArticles: string[], lastUpdateTime: string }> = {}
      for (const [accountName, record] of this.downloadRecords) {
        data[accountName] = {
          downloadedArticles: Array.from(record.downloadedArticles),
          lastUpdateTime: record.lastUpdateTime
        }
      }
      fs.writeFileSync(recordPath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      console.log(chalk.yellow('  保存下载记录失败'))
    }
  }

  /**
   * 加载合并记录
   */
  private loadMergeRecords(): void {
    const recordPath = path.join(this.mergedDir, MERGE_RECORD_FILE)
    try {
      if (fs.existsSync(recordPath)) {
        const data: MergeRecordData = JSON.parse(fs.readFileSync(recordPath, 'utf-8'))
        for (const [accountName, record] of Object.entries(data)) {
          this.mergeRecords.set(accountName, {
            mergedFiles: new Set(record.mergedFiles),
            lastMergeIndex: record.lastMergeIndex,
            lastMergeCount: record.lastMergeCount
          })
        }
      }
    } catch (error) {
      // 合并记录加载失败不影响运行
    }
  }

  /**
   * 保存合并记录
   */
  private saveMergeRecords(): void {
    if (!fs.existsSync(this.mergedDir)) {
      fs.mkdirSync(this.mergedDir, { recursive: true })
    }
    const recordPath = path.join(this.mergedDir, MERGE_RECORD_FILE)
    try {
      const data: MergeRecordData = {}
      for (const [accountName, record] of this.mergeRecords) {
        data[accountName] = {
          mergedFiles: Array.from(record.mergedFiles),
          lastMergeIndex: record.lastMergeIndex,
          lastMergeCount: record.lastMergeCount
        }
      }
      fs.writeFileSync(recordPath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      console.log(chalk.yellow('  保存合并记录失败'))
    }
  }

  /**
   * 启动定时进度汇报（每15分钟）
   */
  private startProgressReporter(): void {
    this.stopProgressReporter()
    const REPORT_INTERVAL = 15 * 60 * 1000 // 15分钟
    this.progressTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.downloadStartTime) / 1000)
      const hours = Math.floor(elapsed / 3600)
      const minutes = Math.floor((elapsed % 3600) / 60)
      const timeStr = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`

      console.log(chalk.bold.cyan('\n⏱️  定时进度汇报'))
      console.log(chalk.gray('─'.repeat(40)))
      console.log(chalk.cyan(`  运行时间: ${timeStr}`))
      console.log(chalk.green(`  已下载: ${this.totalDownloadedArticles} 篇`))
      console.log(chalk.gray(`  已跳过: ${this.totalSkippedArticles} 篇`))
      if (this.totalFailedArticles > 0) {
        console.log(chalk.red(`  失败: ${this.totalFailedArticles} 篇`))
      }
      console.log(chalk.yellow(`  当前账号: ${this.currentAccountName || '无'}`))
      if (this.currentAccountProgress) {
        console.log(chalk.gray(`  当前进度: ${this.currentAccountProgress}`))
      }
      console.log(chalk.gray('─'.repeat(40) + '\n'))
    }, REPORT_INTERVAL)
  }

  /**
   * 停止定时进度汇报
   */
  private stopProgressReporter(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  }

  /**
   * 检查文章是否已下载
   */
  private isArticleDownloaded(accountName: string, articleLink: string): boolean {
    const record = this.downloadRecords.get(accountName)
    return record ? record.downloadedArticles.has(articleLink) : false
  }

  /**
   * 记录文章已下载
   */
  private markArticleDownloaded(accountName: string, articleLink: string): void {
    let record = this.downloadRecords.get(accountName)
    if (!record) {
      record = {
        accountName,
        downloadedArticles: new Set(),
        lastUpdateTime: new Date().toISOString()
      }
      this.downloadRecords.set(accountName, record)
    }
    record.downloadedArticles.add(articleLink)
    record.lastUpdateTime = new Date().toISOString()
  }

  /**
   * 根据公众号名称搜索并获取精确匹配的公众号
   * 支持模糊匹配 - 使用 API 层的增强模糊匹配
   */
  async findAccountByName(name: string): Promise<AccountInfo | null> {
    const spinner = ora(`搜索公众号: ${name}`).start()

    try {
      // 首先使用 API 层的增强模糊匹配
      const account = await this.api.searchAccountWithFuzzyMatch(name)

      if (account) {
        spinner.succeed(`找到公众号: ${account.nickname} (fakeid: ${account.fakeid})`)
        return account
      }

      // 如果 API 层匹配失败，尝试本地备用策略
      const searchTerms = [
        name,                              // 原始名称
        name.replace(/[-_]/g, ''),         // 移除分隔符
        name.replace(/\s+/g, ''),          // 移除空格
      ]

      for (const searchTerm of searchTerms) {
        if (searchTerm === name) continue // 已经尝试过了

        try {
          const result = await this.api.searchAccount(searchTerm, 0, 50)

          if (result.list && result.list.length > 0) {
            const fuzzyMatch = this.findBestMatch(name, result.list)
            if (fuzzyMatch) {
              spinner.succeed(`找到公众号: ${fuzzyMatch.nickname} (fakeid: ${fuzzyMatch.fakeid})`)
              return fuzzyMatch
            }
          }
        } catch {
          // 继续尝试下一个搜索策略
        }
      }
    } catch (error) {
      // 忽略错误，返回 null
    }

    spinner.fail(`未找到公众号: ${name}`)
    return null
  }

  /**
   * 从搜索结果中找到最佳匹配（模糊匹配）
   */
  private findBestMatch(searchName: string, accounts: AccountInfo[]): AccountInfo | null {
    const normalizedSearch = this.normalizeName(searchName)

    // 1. 忽略大小写和特殊字符的匹配
    for (const account of accounts) {
      const normalizedNickname = this.normalizeName(account.nickname)
      const normalizedAlias = account.alias ? this.normalizeName(account.alias) : ''

      if (normalizedNickname === normalizedSearch || normalizedAlias === normalizedSearch) {
        return account
      }
    }

    // 2. 包含匹配
    for (const account of accounts) {
      const nickname = this.normalizeName(account.nickname)
      const alias = account.alias ? this.normalizeName(account.alias) : ''

      if (nickname.includes(normalizedSearch) || normalizedSearch.includes(nickname) ||
          alias.includes(normalizedSearch) || normalizedSearch.includes(alias)) {
        return account
      }
    }

    // 3. 首字符匹配
    const firstPart = searchName.split(/[-_\s]/)[0]
    if (firstPart && firstPart.length >= 2) {
      for (const account of accounts) {
        if (account.nickname.includes(firstPart) ||
            (account.alias && account.alias.includes(firstPart))) {
          return account
        }
      }
    }

    // 4. 如果只有一个结果，直接返回
    if (accounts.length === 1) {
      return accounts[0] ?? null
    }

    return null
  }

  /**
   * 标准化名称（移除特殊字符、转小写）
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[-_\s]/g, '')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  }

  /**
   * 下载单个公众号的所有文章
   */
  async downloadAllArticles(account: AccountInfo): Promise<DownloadStats> {
    const startTime = Date.now()
    const accountDir = path.join(this.downloadDir, this.sanitizeFilename(account.nickname))

    // 创建公众号专属目录
    if (!fs.existsSync(accountDir)) {
      fs.mkdirSync(accountDir, { recursive: true })
    }

    console.log(chalk.cyan(`\n📚 开始下载公众号文章: ${account.nickname}`))
    console.log(chalk.gray(`   目录: ${accountDir}`))

    // 获取所有文章列表
    const spinner = ora('获取文章列表...').start()

    let articles: Article[] = []
    try {
      articles = await this.api.getAllArticles(account.fakeid, (current, total) => {
        spinner.text = `获取文章列表... (${current}/${total})`
        this.currentAccountProgress = `获取列表 ${current}/${total}`
      })
      spinner.succeed(`获取到 ${articles.length} 篇文章`)
    } catch (error) {
      spinner.fail('获取文章列表失败')
      throw error
    }

    if (articles.length === 0) {
      console.log(chalk.yellow('  没有找到文章'))
      return { total: 0, downloaded: 0, failed: 0, mergedFiles: 0, mergedSize: '0 KB', duration: 0 }
    }

    // 并发下载文章（安全加速）
    let downloaded = 0
    let failed = 0
    let skipped = 0
    const CONCURRENCY = 5 // 高并发下载，速率限制器控制节奏

    // 过滤已下载的文章
    const pendingArticles = articles.filter(article => {
      if (!article) return false
      if (this.isArticleDownloaded(account.nickname, article.link)) {
        skipped++
        return false
      }
      const filename = this.generateFilename(article)
      const filePath = path.join(accountDir, filename)
      if (fs.existsSync(filePath)) {
        this.markArticleDownloaded(account.nickname, article.link)
        downloaded++
        return false
      }
      return true
    })

    console.log(chalk.gray(`  待下载: ${pendingArticles.length} 篇, 已跳过: ${skipped + downloaded} 篇`))

    // 并发下载处理函数
    const downloadArticle = async (article: Article, index: number): Promise<void> => {
      const progress = `[${index + 1}/${articles.length}]`
      const filename = this.generateFilename(article)
      const filePath = path.join(accountDir, filename)

      try {
        const content = await this.api.downloadArticle(article.link, { format: 'markdown' })
        const fullContent = this.addMetadata(article, content)
        fs.writeFileSync(filePath, fullContent, 'utf-8')
        console.log(chalk.green(`${progress} ✓ ${article.title}`))
        this.markArticleDownloaded(account.nickname, article.link)
        downloaded++
      } catch (error) {
        console.log(chalk.red(`${progress} ✗ 下载失败: ${article.title}`))
        failed++
      }
    }

    // 分批并发执行
    for (let i = 0; i < pendingArticles.length; i += CONCURRENCY) {
      const batch = pendingArticles.slice(i, i + CONCURRENCY)
      const startIndex = articles.indexOf(batch[0]!)
      this.currentAccountProgress = `下载中 ${startIndex + batch.length}/${articles.length} (成功${downloaded}, 失败${failed})`

      await Promise.all(
        batch.map((article, batchIndex) =>
          downloadArticle(article, startIndex + batchIndex)
        )
      )

      // 批次间延迟已由速率限制器控制，无需额外等待
    }

    // 保存下载记录
    this.saveDownloadRecords()

    console.log(chalk.cyan(`\n  完成! 成功: ${downloaded}, 跳过: ${skipped}, 失败: ${failed}`))

    // 合并文章
    const mergeResult = await this.mergeAccountArticles(account.nickname)

    const duration = Math.floor((Date.now() - startTime) / 1000)
    return {
      total: articles.length,
      downloaded,
      failed,
      mergedFiles: mergeResult.fileCount,
      mergedSize: mergeResult.totalSize,
      duration
    }
  }

  /**
   * 检查公众号是否已完成下载
   * 通过检查已下载文件数量和记录来判断
   */
  private isAccountCompleted(accountName: string): boolean {
    const record = this.downloadRecords.get(accountName)
    if (!record) return false

    const accountDir = path.join(this.downloadDir, this.sanitizeFilename(accountName))
    if (!fs.existsSync(accountDir)) return false

    // 计算已下载的文件数量（排除合并文件）
    const mdFiles = fs.readdirSync(accountDir)
      .filter(name => name.endsWith('.md') && !name.includes('+合并'))

    // 如果有超过100个文件，且下载记录中的URL数量接近文件数量（差距<50）
    // 说明大部分文章已下载，且上次下载成功完成（非中途失败）
    // 注意：如果上次有很多失败（文件数远小于API返回总数），需要重新下载
    if (mdFiles.length > 100 && record.downloadedArticles.size >= mdFiles.length - 50 && record.downloadedArticles.size < mdFiles.length + 50) {
      return true
    }

    return false
  }

  /**
   * 批量下载多个公众号的文章
   */
  async downloadMultipleAccounts(accountNames: string[]): Promise<void> {
    console.log(chalk.bold.cyan('\n🚀 开始批量下载微信公众号文章\n'))
    console.log(chalk.gray(`目标公众号: ${accountNames.join(', ')}`))
    console.log(chalk.gray(`下载目录: ${this.downloadDir}\n`))

    const batchStartTime = Date.now()
    this.downloadStartTime = batchStartTime
    this.totalDownloadedArticles = 0
    this.totalSkippedArticles = 0
    this.totalFailedArticles = 0
    this.currentAccountName = ''
    this.currentAccountProgress = ''
    const allResults: DownloadResult[] = []
    const results: { name: string; status: string; count: number }[] = []

    // 启动定时进度汇报
    this.startProgressReporter()

    // 检查并跳过已完成的公众号
    const completedAccounts: string[] = []
    const pendingAccounts: string[] = []

    for (const name of accountNames) {
      if (this.isAccountCompleted(name)) {
        const record = this.downloadRecords.get(name)
        const count = record ? record.downloadedArticles.size : 0
        completedAccounts.push(name)
        results.push({ name, status: '已完成', count })
        console.log(chalk.green(`✓ 跳过已完成的公众号: ${name} (${count} 篇文章)`))
      } else {
        pendingAccounts.push(name)
      }
    }

    if (completedAccounts.length > 0) {
      console.log(chalk.gray(`\n已跳过 ${completedAccounts.length} 个已完成的公众号\n`))
    }

    if (pendingAccounts.length === 0) {
      console.log(chalk.bold.green('\n✨ 所有公众号都已下载完成！\n'))
      return
    }

    console.log(chalk.cyan(`待下载公众号: ${pendingAccounts.join(', ')}\n`))

    for (const name of pendingAccounts) {
      const accountStartTime = Date.now()
      this.currentAccountName = name
      this.currentAccountProgress = '搜索中...'
      try {
        // 搜索公众号
        const account = await this.findAccountByName(name)

        if (!account) {
          results.push({ name, status: '未找到', count: 0 })
          await this.notification.sendErrorNotification(name, '未找到公众号')
          continue
        }

        // 下载文章
        const stats = await this.downloadAllArticles(account)
        this.totalDownloadedArticles += stats.downloaded
        this.totalSkippedArticles += (stats.total - stats.downloaded - stats.failed)
        this.totalFailedArticles += stats.failed
        this.currentAccountProgress = `完成 (成功${stats.downloaded}, 跳过${stats.total - stats.downloaded - stats.failed}, 失败${stats.failed})`
        results.push({ name, status: '成功', count: stats.downloaded })

        // 发送单个公众号完成通知
        const result: DownloadResult = {
          accountName: name,
          totalArticles: stats.total,
          downloadedArticles: stats.downloaded,
          failedArticles: stats.failed,
          mergedFiles: stats.mergedFiles,
          mergedFileSize: stats.mergedSize,
          duration: Math.floor((Date.now() - accountStartTime) / 1000)
        }
        allResults.push(result)

        await this.notification.sendDownloadCompleteNotification(result)

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`处理公众号 "${name}" 时出错:`), error)
        results.push({ name, status: '失败', count: 0 })
        await this.notification.sendErrorNotification(name, errorMessage)
      }

      // 在下载下一个公众号之前，添加短暂随机延迟
      if (results.length < accountNames.length) {
        const delaySeconds = 2 + Math.random() * 3
        console.log(chalk.gray(`\n⏳ 等待 ${delaySeconds.toFixed(1)} 秒后继续...\n`))
        await this.delay(Math.floor(delaySeconds * 1000))
      }
    }

    // 停止定时进度汇报
    this.stopProgressReporter()

    // 打印汇总
    console.log(chalk.bold.cyan('\n📊 下载汇总\n'))
    console.log(chalk.gray('─'.repeat(50)))

    for (const result of results) {
      const status = result.status === '成功'
        ? chalk.green('✓')
        : result.status === '未找到'
          ? chalk.yellow('?')
          : chalk.red('✗')

      console.log(`${status} ${result.name}: ${result.count} 篇文章`)
    }

    console.log(chalk.gray('─'.repeat(50)))
    const total = results.reduce((sum, r) => sum + r.count, 0)
    console.log(chalk.bold(`总计: ${total} 篇文章\n`))

    // 发送批量完成通知
    if (allResults.length > 0) {
      const totalDuration = Math.floor((Date.now() - batchStartTime) / 1000)
      await this.notification.sendBatchCompleteNotification(allResults, totalDuration)
    }
  }

  /**
   * 合并所有公众号目录下的 Markdown 文件
   * 每500个文件合并为一个，合并前删除之前所有已合并文件
   */
  async mergeAllArticles(): Promise<void> {
    console.log(chalk.bold.cyan('\n📚 开始合并 Markdown 文件\n'))

    // 获取所有公众号目录
    const accountDirs = fs.readdirSync(this.downloadDir)
      .filter(name => {
        const fullPath = path.join(this.downloadDir, name)
        return fs.statSync(fullPath).isDirectory()
      })

    if (accountDirs.length === 0) {
      console.log(chalk.yellow('未找到任何公众号目录'))
      return
    }

    for (const accountName of accountDirs) {
      await this.mergeAccountArticles(accountName)
    }

    console.log(chalk.bold.green('\n✨ 合并完成！\n'))
  }

  /**
   * 合并单个公众号的文章（增量合并）
   * 只合并新增的文章，追加到最后一个合并文件或创建新文件
   */
  private async mergeAccountArticles(accountName: string): Promise<{ fileCount: number; totalSize: string }> {
    const accountDir = path.join(this.downloadDir, accountName)

    console.log(chalk.cyan(`\n处理公众号: ${accountName}`))

    // 获取所有 .md 文件（排除合并文件）
    const allMdFiles = fs.readdirSync(accountDir)
      .filter(name => name.endsWith('.md') && !name.includes('+合并'))
      .map(name => ({
        name,
        path: path.join(accountDir, name),
        mtime: fs.statSync(path.join(accountDir, name)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    if (allMdFiles.length === 0) {
      console.log(chalk.gray(`  没有 Markdown 文件需要合并`))
      return { fileCount: 0, totalSize: '0 KB' }
    }

    // 获取合并记录，筛选出未合并的新文件
    const mergeRec = this.mergeRecords.get(accountName)
    const newFiles = mergeRec
      ? allMdFiles.filter(f => !mergeRec.mergedFiles.has(f.name))
      : allMdFiles

    if (newFiles.length === 0) {
      console.log(chalk.gray(`  找到 ${allMdFiles.length} 个文件，无新增需合并`))
      return { fileCount: 0, totalSize: '0 KB' }
    }

    console.log(chalk.gray(`  找到 ${allMdFiles.length} 个文件，${newFiles.length} 个新增需合并`))

    // 创建合并目录
    if (!fs.existsSync(this.mergedDir)) {
      fs.mkdirSync(this.mergedDir, { recursive: true })
    }

    let totalSizeBytes = 0
    let newMergeFilesCreated = 0

    if (!mergeRec || mergeRec.lastMergeIndex === 0) {
      // 首次合并：全量处理
      const result = await this.fullMerge(accountName, allMdFiles)
      totalSizeBytes = result.totalSizeBytes
      newMergeFilesCreated = result.fileCount
    } else {
      // 增量合并：追加新文件
      const result = await this.incrementalMerge(accountName, newFiles, mergeRec)
      totalSizeBytes = result.totalSizeBytes
      newMergeFilesCreated = result.fileCount
    }

    return {
      fileCount: newMergeFilesCreated,
      totalSize: totalSizeBytes > 1024 * 1024
        ? `${(totalSizeBytes / 1024 / 1024).toFixed(2)} MB`
        : `${(totalSizeBytes / 1024).toFixed(1)} KB`
    }
  }

  /**
   * 全量合并（首次或无记录时）
   */
  private async fullMerge(accountName: string, mdFiles: Array<{ name: string; path: string; mtime: Date }>): Promise<{ fileCount: number; totalSizeBytes: number }> {
    // 删除旧的合并文件
    const oldMergedFiles = fs.readdirSync(this.mergedDir)
      .filter(name => name.startsWith(accountName) && name.includes('+合并') && name.endsWith('.md'))

    if (oldMergedFiles.length > 0) {
      console.log(chalk.gray(`  删除 ${oldMergedFiles.length} 个旧的合并文件...`))
      for (const file of oldMergedFiles) {
        fs.unlinkSync(path.join(this.mergedDir, file))
      }
    }

    const totalFiles = mdFiles.length
    const mergeCount = Math.ceil(totalFiles / MERGE_SIZE)
    console.log(chalk.gray(`  首次合并，将合并为 ${mergeCount} 个文件`))

    let totalSizeBytes = 0
    const mergedFileNames = new Set<string>()

    for (let i = 0; i < mergeCount; i++) {
      const start = i * MERGE_SIZE
      const end = Math.min(start + MERGE_SIZE, totalFiles)
      const batchFiles = mdFiles.slice(start, end)

      const mergedFileName = `${accountName}+合并${i + 1}.md`
      const mergedFilePath = path.join(this.mergedDir, mergedFileName)

      console.log(chalk.gray(`  合并第 ${i + 1}/${mergeCount} 批 (${batchFiles.length} 个文件)...`))

      const header = this.generateMergeHeader(accountName, i + 1, mergeCount, batchFiles.length)
      const contents: string[] = [header]

      for (const file of batchFiles) {
        try {
          const content = fs.readFileSync(file.path, 'utf-8')
          contents.push(content)
          contents.push('\n\n---\n\n')
        } catch (error) {
          console.log(chalk.yellow(`  警告: 无法读取文件 ${file.name}`))
        }
        mergedFileNames.add(file.name)
      }

      fs.writeFileSync(mergedFilePath, contents.join('\n'), 'utf-8')
      const fileSize = (contents.join('\n').length / 1024).toFixed(1)
      console.log(chalk.green(`  ✓ 已创建: ${mergedFileName} (${fileSize} KB)`))
      totalSizeBytes += contents.join('\n').length
    }

    // 更新合并记录
    this.mergeRecords.set(accountName, {
      mergedFiles: mergedFileNames,
      lastMergeIndex: mergeCount,
      lastMergeCount: totalFiles % MERGE_SIZE === 0 ? MERGE_SIZE : totalFiles % MERGE_SIZE
    })
    this.saveMergeRecords()

    return { fileCount: mergeCount, totalSizeBytes }
  }

  /**
   * 增量合并（追加新文章）
   */
  private async incrementalMerge(
    accountName: string,
    newFiles: Array<{ name: string; path: string; mtime: Date }>,
    mergeRec: AccountMergeRecord
  ): Promise<{ fileCount: number; totalSizeBytes: number }> {
    let remaining = [...newFiles]
    let totalSizeBytes = 0
    let filesCreated = 0
    const allNewMergedNames = new Set<string>()

    // 如果最后一个合并文件未满，追加到该文件
    if (mergeRec.lastMergeCount < MERGE_SIZE) {
      const spaceInLast = MERGE_SIZE - mergeRec.lastMergeCount
      const toAppend = remaining.slice(0, spaceInLast)
      remaining = remaining.slice(spaceInLast)

      const lastFileName = `${accountName}+合并${mergeRec.lastMergeIndex}.md`
      const lastFilePath = path.join(this.mergedDir, lastFileName)

      if (fs.existsSync(lastFilePath) && toAppend.length > 0) {
        console.log(chalk.gray(`  追加 ${toAppend.length} 篇到最后一个合并文件 ${lastFileName}...`))

        // 读取现有内容
        let existingContent = fs.readFileSync(lastFilePath, 'utf-8')

        // 追加新文章
        const appendParts: string[] = []
        for (const file of toAppend) {
          try {
            const content = fs.readFileSync(file.path, 'utf-8')
            appendParts.push(content)
            appendParts.push('\n\n---\n\n')
          } catch (error) {
            console.log(chalk.yellow(`  警告: 无法读取文件 ${file.name}`))
          }
          allNewMergedNames.add(file.name)
        }

        const appendedContent = existingContent + appendParts.join('\n')
        const newCount = mergeRec.lastMergeCount + toAppend.length

        // 更新头部信息中的文件数
        const updatedHeader = this.generateMergeHeader(accountName, mergeRec.lastMergeIndex, mergeRec.lastMergeIndex, newCount)
        // 替换header部分（从开头到第一个正文内容）
        const headerEndMarker = '\n---\n\n'
        const headerEndIndex = appendedContent.indexOf(headerEndMarker)
        if (headerEndIndex !== -1) {
          const afterHeader = appendedContent.substring(headerEndIndex + headerEndMarker.length)
          const finalContent = updatedHeader + afterHeader
          fs.writeFileSync(lastFilePath, finalContent, 'utf-8')
          const fileSize = (finalContent.length / 1024).toFixed(1)
          console.log(chalk.green(`  ✓ 已更新: ${lastFileName} (${fileSize} KB)`))
          totalSizeBytes += finalContent.length
        } else {
          // 无法定位header，直接追加
          fs.writeFileSync(lastFilePath, appendedContent, 'utf-8')
          totalSizeBytes += appendedContent.length
        }

        mergeRec.lastMergeCount = newCount
      }
    }

    // 如果还有剩余文件，创建新的合并文件
    while (remaining.length > 0) {
      const batch = remaining.slice(0, MERGE_SIZE)
      remaining = remaining.slice(MERGE_SIZE)

      const newIndex = mergeRec.lastMergeIndex + 1
      const mergedFileName = `${accountName}+合并${newIndex}.md`
      const mergedFilePath = path.join(this.mergedDir, mergedFileName)

      // 计算总文件数（用于header显示）
      const totalCount = newIndex
      console.log(chalk.gray(`  创建新合并文件 ${mergedFileName} (${batch.length} 个文件)...`))

      const header = this.generateMergeHeader(accountName, newIndex, totalCount, batch.length)
      const contents: string[] = [header]

      for (const file of batch) {
        try {
          const content = fs.readFileSync(file.path, 'utf-8')
          contents.push(content)
          contents.push('\n\n---\n\n')
        } catch (error) {
          console.log(chalk.yellow(`  警告: 无法读取文件 ${file.name}`))
        }
        allNewMergedNames.add(file.name)
      }

      fs.writeFileSync(mergedFilePath, contents.join('\n'), 'utf-8')
      const fileSize = (contents.join('\n').length / 1024).toFixed(1)
      console.log(chalk.green(`  ✓ 已创建: ${mergedFileName} (${fileSize} KB)`))
      totalSizeBytes += contents.join('\n').length
      filesCreated++

      mergeRec.lastMergeIndex = newIndex
      mergeRec.lastMergeCount = batch.length
    }

    // 更新合并记录
    mergeRec.mergedFiles = new Set([...mergeRec.mergedFiles, ...allNewMergedNames])
    this.mergeRecords.set(accountName, mergeRec)
    this.saveMergeRecords()

    return { fileCount: filesCreated, totalSizeBytes }
  }

  /**
   * 生成合并文件头部信息
   */
  private generateMergeHeader(accountName: string, part: number, total: number, fileCount: number): string {
    const now = new Date().toLocaleString('zh-CN')
    return `---
title: ${accountName} - 文章合集 (${part}/${total})
source: 微信公众号
account: ${accountName}
merged_at: ${now}
file_count: ${fileCount}
---

# ${accountName} - 文章合集 (第${part}部分，共${total}部分)

> 本文件由 ${fileCount} 篇文章合并而成
> 合并时间: ${now}

---

`
  }

  /**
   * 生成安全的文件名
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').trim()
  }

  /**
   * 生成文章文件名
   */
  private generateFilename(article: Article): string {
    const title = this.sanitizeFilename(article.title)
    const date = new Date(article.create_time * 1000).toISOString().split('T')[0]
    return `${date}_${title}.md`
  }

  /**
   * 添加文章元信息
   */
  private addMetadata(article: Article, content: string): string {
    const date = new Date(article.create_time * 1000).toLocaleString('zh-CN')
    const header = `---
title: ${article.title}
author: ${article.author_name || '未知'}
date: ${date}
url: ${article.link}
---

# ${article.title}

`
    return header + content
  }

  /**
   * 延迟函数（带随机抖动）
   */
  private delay(ms: number, jitterRatio: number = 0.3): Promise<void> {
    const jitter = ms * jitterRatio * (Math.random() * 2 - 1)
    const actualDelay = Math.max(100, Math.floor(ms + jitter))
    return new Promise(resolve => setTimeout(resolve, actualDelay))
  }
}
