/**
 * Web 可视化界面服务器
 * 提供 REST API + SSE 实时推送
 */

import express from 'express'
import { EventEmitter } from 'events'
import * as path from 'path'
import { exec } from 'child_process'
import { ArticleDownloader } from '../downloader'

export interface AccountProgress {
  name: string
  status: 'pending' | 'searching' | 'downloading' | 'completed' | 'failed' | 'not_found'
  total: number
  downloaded: number
  skipped: number
  failed: number
  currentArticle: string
}

export interface OverallProgress {
  totalAccounts: number
  completedAccounts: number
  totalArticles: number
  downloadedArticles: number
  failedArticles: number
  duration: number
  accounts: AccountProgress[]
  status: 'idle' | 'running' | 'paused' | 'completed'
  currentApiKey: string
}

const progressEmitter = new EventEmitter()
progressEmitter.setMaxListeners(100)

let currentProgress: OverallProgress = {
  totalAccounts: 0,
  completedAccounts: 0,
  totalArticles: 0,
  downloadedArticles: 0,
  failedArticles: 0,
  duration: 0,
  accounts: [],
  status: 'idle',
  currentApiKey: ''
}

let downloader: ArticleDownloader | null = null
let downloadStartTime = 0
let isPaused = false
let abortController: AbortController | null = null

function broadcastProgress(): void {
  if (downloadStartTime > 0) {
    currentProgress.duration = Math.floor((Date.now() - downloadStartTime) / 1000)
  }
  progressEmitter.emit('progress', { ...currentProgress })
}

function updateAccountProgress(
  name: string,
  update: Partial<AccountProgress>
): void {
  const idx = currentProgress.accounts.findIndex(a => a.name === name)
  if (idx >= 0) {
    const existing = currentProgress.accounts[idx]!
    currentProgress.accounts[idx] = { ...existing, ...update }
  }
  broadcastProgress()
}

export function createWebServer(port: number = 3000): express.Application {
  const app = express()

  app.use(express.json())
  app.use(express.static(path.join(__dirname, 'public')))

  // SSE endpoint for real-time progress
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    const handler = (data: OverallProgress) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    progressEmitter.on('progress', handler)

    // Send current state immediately
    res.write(`data: ${JSON.stringify(currentProgress)}\n\n`)

    req.on('close', () => {
      progressEmitter.off('progress', handler)
    })
  })

  // Get current progress
  app.get('/api/progress', (_req, res) => {
    res.json(currentProgress)
  })

  // Start download
  app.post('/api/start', (req, res) => {
    const { accounts, apiKey } = req.body as { accounts: string[]; apiKey: string }

    if (!accounts || accounts.length === 0) {
      res.status(400).json({ error: '请输入公众号名称' })
      return
    }

    if (!apiKey || apiKey.length < 20) {
      res.status(400).json({ error: '请输入有效的API密钥' })
      return
    }

    if (currentProgress.status === 'running') {
      res.status(400).json({ error: '下载正在进行中' })
      return
    }

    isPaused = false
    downloadStartTime = Date.now()
    currentProgress = {
      totalAccounts: accounts.length,
      completedAccounts: 0,
      totalArticles: 0,
      downloadedArticles: 0,
      failedArticles: 0,
      duration: 0,
      accounts: accounts.map(name => ({
        name,
        status: 'pending' as const,
        total: 0,
        downloaded: 0,
        skipped: 0,
        failed: 0,
        currentArticle: ''
      })),
      status: 'running',
      currentApiKey: apiKey.substring(0, 8) + '...'
    }
    broadcastProgress()

    downloader = new ArticleDownloader(apiKey, path.resolve('Downloads'))

    // Run download in background
    runDownload(accounts)

    res.json({ message: '下载已启动' })
  })

  // Pause download
  app.post('/api/pause', (_req, res) => {
    if (currentProgress.status !== 'running') {
      res.status(400).json({ error: '当前没有正在运行的下载' })
      return
    }
    isPaused = true
    currentProgress.status = 'paused'
    broadcastProgress()
    res.json({ message: '已暂停' })
  })

  // Resume download
  app.post('/api/resume', (_req, res) => {
    if (currentProgress.status !== 'paused') {
      res.status(400).json({ error: '当前没有暂停的下载' })
      return
    }
    isPaused = false
    currentProgress.status = 'running'
    broadcastProgress()
    res.json({ message: '已继续' })
  })

  // Stop download
  app.post('/api/stop', (_req, res) => {
    if (abortController) {
      abortController.abort()
    }
    currentProgress.status = 'idle'
    broadcastProgress()
    res.json({ message: '已停止' })
  })

  // Auto-open browser
  app.listen(port, () => {
    const url = `http://localhost:${port}`
    console.log(`\n  Web 界面已启动: ${url}`)
    // Windows 下使用 cmd /c start 确保在 Git Bash 中也能打开
    const command = process.platform === 'win32'
      ? `cmd /c start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`
    exec(command, (err) => {
      if (err) console.log(`  请手动打开浏览器访问: ${url}`)
    })
  })

  return app
}

async function runDownload(accounts: string[]): Promise<void> {
  abortController = new AbortController()

  for (const accountName of accounts) {
    if (abortController.signal.aborted) break

    // Wait if paused
    while (isPaused && !abortController.signal.aborted) {
      await new Promise(r => setTimeout(r, 1000))
    }
    if (abortController.signal.aborted) break

    updateAccountProgress(accountName, { status: 'searching', currentArticle: '搜索中...' })

    try {
      if (!downloader) break

      const account = await downloader.findAccountByName(accountName)

      if (!account) {
        updateAccountProgress(accountName, {
          status: 'not_found',
          currentArticle: '未找到公众号'
        })
        currentProgress.completedAccounts++
        continue
      }

      // Get article count first
      updateAccountProgress(accountName, { status: 'downloading', currentArticle: '获取文章列表...' })

      // Download all articles - the downloader handles the full flow
      const stats = await downloader.downloadAllArticles(account)

      updateAccountProgress(accountName, {
        status: 'completed',
        total: stats.total,
        downloaded: stats.downloaded,
        skipped: stats.total - stats.downloaded - stats.failed,
        failed: stats.failed,
        currentArticle: '完成'
      })

      currentProgress.completedAccounts++
      currentProgress.totalArticles += stats.total
      currentProgress.downloadedArticles += stats.downloaded
      currentProgress.failedArticles += stats.failed
      broadcastProgress()

      // Delay between accounts
      if (currentProgress.completedAccounts < accounts.length) {
        const delaySeconds = 2 + Math.random() * 3
        await new Promise(r => setTimeout(r, delaySeconds * 1000))
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateAccountProgress(accountName, {
        status: 'failed',
        currentArticle: errorMessage
      })
      currentProgress.completedAccounts++
      broadcastProgress()
    }
  }

  if (currentProgress.status !== 'idle') {
    currentProgress.status = 'completed'
    broadcastProgress()
  }
}
