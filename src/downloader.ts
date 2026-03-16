/**
 * 微信公众号文章导出器 - 下载管理器
 */

import * as fs from 'fs'
import * as path from 'path'
import { WeChatAPI } from './api'
import { AccountInfo, Article } from './types'
import chalk from 'chalk'
import ora from 'ora'

const MERGE_SIZE = 500 // 每500个文件合并为一个

export class ArticleDownloader {
  private api: WeChatAPI
  private downloadDir: string

  constructor(apiKey: string, downloadDir: string) {
    this.api = new WeChatAPI(apiKey)
    this.downloadDir = downloadDir

    // 确保下载目录存在
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }
  }

  /**
   * 根据公众号名称搜索并获取精确匹配的公众号
   */
  async findAccountByName(name: string): Promise<AccountInfo | null> {
    const spinner = ora(`搜索公众号: ${name}`).start()

    try {
      const result = await this.api.searchAccount(name, 0, 20)

      if (result.list && result.list.length > 0) {
        // 精确匹配名称
        const exactMatch = result.list.find(
          account => account.nickname === name || account.alias === name
        )

        if (exactMatch) {
          spinner.succeed(`找到公众号: ${exactMatch.nickname} (fakeid: ${exactMatch.fakeid})`)
          return exactMatch
        } else {
          spinner.warn(`未找到精确匹配的公众号 "${name}"`)
          console.log(chalk.gray(`  搜索结果: ${result.list.map(a => a.nickname).join(', ')}`))
          return null
        }
      } else {
        spinner.fail(`未找到公众号: ${name}`)
        return null
      }
    } catch (error) {
      spinner.fail(`搜索公众号失败: ${name}`)
      throw error
    }
  }

  /**
   * 下载单个公众号的所有文章
   */
  async downloadAllArticles(account: AccountInfo): Promise<number> {
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
      })
      spinner.succeed(`获取到 ${articles.length} 篇文章`)
    } catch (error) {
      spinner.fail('获取文章列表失败')
      throw error
    }

    if (articles.length === 0) {
      console.log(chalk.yellow('  没有找到文章'))
      return 0
    }

    // 下载每篇文章
    let downloaded = 0
    let failed = 0

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]
      const progress = `[${i + 1}/${articles.length}]`

      try {
        // 检查文件是否已存在
        const filename = this.generateFilename(article)
        const filePath = path.join(accountDir, filename)

        if (fs.existsSync(filePath)) {
          console.log(chalk.gray(`${progress} 跳过已存在: ${article.title}`))
          downloaded++
          continue
        }

        // 下载文章内容
        const content = await this.api.downloadArticle(article.link, { format: 'markdown' })

        // 添加元信息
        const fullContent = this.addMetadata(article, content)

        // 保存文件
        fs.writeFileSync(filePath, fullContent, 'utf-8')
        console.log(chalk.green(`${progress} ✓ ${article.title}`))
        downloaded++

        // 避免请求过快
        await this.delay(300)
      } catch (error) {
        console.log(chalk.red(`${progress} ✗ 下载失败: ${article.title}`))
        failed++
      }
    }

    console.log(chalk.cyan(`\n  完成! 成功: ${downloaded}, 失败: ${failed}`))
    return downloaded
  }

  /**
   * 批量下载多个公众号的文章
   */
  async downloadMultipleAccounts(accountNames: string[]): Promise<void> {
    console.log(chalk.bold.cyan('\n🚀 开始批量下载微信公众号文章\n'))
    console.log(chalk.gray(`目标公众号: ${accountNames.join(', ')}`))
    console.log(chalk.gray(`下载目录: ${this.downloadDir}\n`))

    const results: { name: string; status: string; count: number }[] = []

    for (const name of accountNames) {
      try {
        // 搜索公众号
        const account = await this.findAccountByName(name)

        if (!account) {
          results.push({ name, status: '未找到', count: 0 })
          continue
        }

        // 下载文章
        const count = await this.downloadAllArticles(account)
        results.push({ name, status: '成功', count })

      } catch (error) {
        console.error(chalk.red(`处理公众号 "${name}" 时出错:`), error)
        results.push({ name, status: '失败', count: 0 })
      }
    }

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
   * 合并单个公众号的文章
   */
  private async mergeAccountArticles(accountName: string): Promise<void> {
    const accountDir = path.join(this.downloadDir, accountName)
    const mergedDir = path.join(accountDir, 'merged')

    console.log(chalk.cyan(`\n处理公众号: ${accountName}`))

    // 获取所有 .md 文件（排除已合并的）
    const mdFiles = fs.readdirSync(accountDir)
      .filter(name => name.endsWith('.md') && !name.startsWith('_merged_'))
      .map(name => ({
        name,
        path: path.join(accountDir, name),
        mtime: fs.statSync(path.join(accountDir, name)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()) // 按修改时间降序

    if (mdFiles.length === 0) {
      console.log(chalk.gray(`  没有 Markdown 文件需要合并`))
      return
    }

    console.log(chalk.gray(`  找到 ${mdFiles.length} 个 Markdown 文件`))

    // 创建合并目录
    if (!fs.existsSync(mergedDir)) {
      fs.mkdirSync(mergedDir, { recursive: true })
    }

    // 删除之前所有已合并的文件
    const oldMergedFiles = fs.readdirSync(mergedDir)
      .filter(name => name.includes('+合并') && name.endsWith('.md'))

    if (oldMergedFiles.length > 0) {
      console.log(chalk.gray(`  删除 ${oldMergedFiles.length} 个旧的合并文件...`))
      for (const file of oldMergedFiles) {
        fs.unlinkSync(path.join(mergedDir, file))
      }
    }

    // 计算需要合并成多少个文件
    const totalFiles = mdFiles.length
    const mergeCount = Math.ceil(totalFiles / MERGE_SIZE)

    console.log(chalk.gray(`  将合并为 ${mergeCount} 个文件 (每${MERGE_SIZE}个文件合并)`))

    // 分批合并
    for (let i = 0; i < mergeCount; i++) {
      const start = i * MERGE_SIZE
      const end = Math.min(start + MERGE_SIZE, totalFiles)
      const batchFiles = mdFiles.slice(start, end)

      const mergedFileName = `${accountName}+合并${i + 1}.md`
      const mergedFilePath = path.join(mergedDir, mergedFileName)

      console.log(chalk.gray(`  合并第 ${i + 1}/${mergeCount} 批 (${batchFiles.length} 个文件)...`))

      // 构建合并内容
      const header = this.generateMergeHeader(accountName, i + 1, mergeCount, batchFiles.length)
      const contents: string[] = [header]

      for (const file of batchFiles) {
        try {
          const content = fs.readFileSync(file.path, 'utf-8')
          contents.push(content)
          contents.push('\n\n---\n\n') // 分隔符
        } catch (error) {
          console.log(chalk.yellow(`  警告: 无法读取文件 ${file.name}`))
        }
      }

      // 写入合并文件
      fs.writeFileSync(mergedFilePath, contents.join('\n'), 'utf-8')
      console.log(chalk.green(`  ✓ 已创建: ${mergedFileName} (${(contents.join('\n').length / 1024).toFixed(1)} KB)`))
    }
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
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
