/**
 * 微信公众号文章导出器 - API 客户端
 * V2.0 - 增强版：重试机制、模糊搜索、完整分页
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { AccountInfo, ArticleMessage, SearchResult, DownloadOptions } from './types'

const BASE_URL = 'https://down.mptext.top'

interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30000
}

export class WeChatAPI {
  private client: AxiosInstance
  private retryConfig: RetryConfig
  private warmupDone = false

  constructor(apiKey: string, retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig }
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000, // 30秒超时
      headers: {
        'X-Auth-Key': apiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
  }

  /**
   * 预热连接（解决 Cloudflare 冷启动问题）
   */
  async warmup(): Promise<void> {
    if (this.warmupDone) return

    console.log('  预热 API 连接...')
    for (let i = 0; i < 3; i++) {
      try {
        await this.client.get('/api/public/v1/account', {
          params: { keyword: 'test', begin: 0, size: 1 },
          timeout: 15000
        })
        this.warmupDone = true
        console.log('  ✓ 连接预热成功')
        return
      } catch (e) {
        console.log(`  预热尝试 ${i + 1}/3 失败: ${(e as Error).message}`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
    console.log('  ⚠ 预热未成功，但将继续尝试')
  }

  /**
   * 带重试的请求包装器
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const { maxRetries, baseDelay, maxDelay } = { ...this.retryConfig, ...config }
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        // 如果是4xx错误（除了429），不重试
        if (error instanceof AxiosError && error.response) {
          const status = error.response.status
          if (status >= 400 && status < 500 && status !== 429) {
            throw error
          }
        }

        if (attempt < maxRetries) {
          // 指数退避 + 随机抖动
          const delay = Math.min(
            baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
            maxDelay
          )
          console.log(`  ${operationName} 失败 (尝试 ${attempt + 1}/${maxRetries + 1})，${Math.floor(delay / 1000)}秒后重试...`)
          await this.delay(delay)
        }
      }
    }

    throw lastError
  }

  /**
   * 根据关键字搜索公众号（带重试和模糊匹配）
   */
  async searchAccount(keyword: string, begin: number = 0, size: number = 20): Promise<SearchResult> {
    return this.withRetry(
      async () => {
        const response = await this.client.get('/api/public/v1/account', {
          params: { keyword, begin, size }
        })
        return response.data
      },
      '搜索公众号'
    )
  }

  /**
   * 搜索公众号并返回最佳匹配（支持模糊匹配）
   */
  async searchAccountWithFuzzyMatch(name: string): Promise<AccountInfo | null> {
    // 尝试多种搜索策略
    const searchStrategies = [
      name,                           // 原始名称
      name.replace(/[-–—]/g, ''),     // 去除连字符
      name.replace(/\s+/g, ''),       // 去除空格
      name.split(/[-—\s]+/)[0] || ''  // 取第一部分
    ]

    // 去重并过滤空字符串
    const uniqueStrategies = [...new Set(searchStrategies)].filter((s): s is string => s !== undefined && s !== null && s.length > 0)
    for (const keyword of uniqueStrategies) {
      try {
        console.log(`  尝试搜索关键词: "${keyword}"`)
        const result = await this.searchAccount(keyword, 0, 30)
        console.log(`  搜索结果: 找到 ${result.list?.length || 0} 个公众号`)

        if (result.list && result.list.length > 0) {
          // 1. 首先尝试精确匹配
          const exactMatch = result.list.find(
            account => account.nickname === name || account.alias === name
          )
          if (exactMatch) {
            console.log(`  ✓ 精确匹配: ${exactMatch.nickname}`)
            return exactMatch
          }

          // 2. 尝试忽略大小写和空格的匹配
          const normalizedMatch = result.list.find(account => {
            const normalizedNickname = account.nickname.toLowerCase().replace(/\s+/g, '')
            const normalizedAlias = (account.alias || '').toLowerCase().replace(/\s+/g, '')
            const normalizedName = name.toLowerCase().replace(/\s+/g, '')
            return normalizedNickname === normalizedName || normalizedAlias === normalizedName
          })
          if (normalizedMatch) {
            console.log(`  ✓ 标准化匹配: ${normalizedMatch.nickname}`)
            return normalizedMatch
          }

          // 3. 尝试包含匹配
          const containsMatch = result.list.find(account => {
            const nickname = account.nickname.toLowerCase()
            const alias = (account.alias || '').toLowerCase()
            const searchName = name.toLowerCase()
            return nickname.includes(searchName) || searchName.includes(nickname) ||
                   alias.includes(searchName) || searchName.includes(alias)
          })
          if (containsMatch) {
            console.log(`  ✓ 包含匹配: ${containsMatch.nickname}`)
            return containsMatch
          }

          // 4. 返回第一个结果作为最佳猜测
          if (keyword === name) {
            const firstResult = result.list[0] ?? null
            if (firstResult) {
              console.log(`  未找到精确匹配，使用最佳猜测: ${firstResult.nickname}`)
              return firstResult
            }
          }
        }
      } catch (error) {
        console.log(`  使用关键词 "${keyword}" 搜索失败: ${(error as Error).message}`)
      }
    }

    return null
  }

  /**
   * 根据文章链接搜索公众号
   */
  async searchAccountByUrl(url: string): Promise<AccountInfo> {
    return this.withRetry(
      async () => {
        const response = await this.client.get('/api/public/v1/accountbyurl', {
          params: { url }
        })
        return response.data
      },
      '通过链接搜索公众号'
    )
  }

  /**
   * 获取公众号历史文章列表（带重试）
   */
  async getArticles(fakeid: string, begin: number = 0, size: number = 20): Promise<ArticleMessage> {
    return this.withRetry(
      async () => {
        const response = await this.client.get('/api/public/v1/article', {
          params: { fakeid, begin, size }
        })

        // 验证响应是否为有效的 API 响应（而非 Cloudflare HTML）
        const data = response.data
        if (typeof data === 'string' && data.includes('<!DOCTYPE html>')) {
          throw new Error('API 返回了 Cloudflare 验证页面，请稍后重试')
        }
        if (!data || typeof data !== 'object') {
          throw new Error('API 返回了无效的响应')
        }

        return data
      },
      '获取文章列表'
    )
  }

  /**
   * 获取所有历史文章（完整分页，带重试）
   * V2.0 - 确保获取全部历史文章
   */
  async getAllArticles(
    fakeid: string,
    progressCallback?: (current: number, total: number) => void
  ): Promise<ArticleMessage['articles']> {
    // 预热连接
    await this.warmup()

    const allArticles: ArticleMessage['articles'] = []
    const articleMap = new Map<string, boolean>() // 用于去重
    let begin = 0
    const size = 20
    let hasMore = true
    let pageCount = 0
    const maxPages = 1000 // 增加到1000页，支持最多20000篇文章
    let totalCount = 0
    let consecutiveErrors = 0
    const maxConsecutiveErrors = 5 // 连续5次错误才放弃

    console.log(`  开始分页获取文章...`)

    while (hasMore && pageCount < maxPages) {
      try {
        process.stdout.write(`  [${pageCount + 1}] 请求 begin=${begin}...`)
        const result = await this.getArticles(fakeid, begin, size)
        console.log(` 收到 ${result.articles?.length || 0} 篇`)
        pageCount++
        consecutiveErrors = 0 // 重置连续错误计数

        // 第一次请求时获取总数
        if (pageCount === 1 && result.app_msg_cnt) {
          totalCount = result.app_msg_cnt
          console.log(`  文章总数: ${totalCount} 篇`)
        }

        if (result.articles && result.articles.length > 0) {
          // 去重添加文章
          let newCount = 0
          for (const article of result.articles) {
            if (!article) continue
            const key = article.link || `${article.title}_${article.create_time}`
            if (!articleMap.has(key)) {
              articleMap.set(key, true)
              allArticles.push(article)
              newCount++
            }
          }

          if (progressCallback && totalCount > 0) {
            progressCallback(allArticles.length, totalCount)
          }

          // 使用 API 返回的 next_offset
          if (result.next_offset !== undefined && result.next_offset !== null) {
            // next_offset 可能为 0，这是有效的
            if (result.next_offset > begin) {
              begin = result.next_offset
            } else {
              // 如果 next_offset 没有前进，手动增加
              begin += size
            }
          } else {
            begin += size
          }

          // 如果返回的文章数小于请求的size，说明没有更多了
          if (result.articles.length < size) {
            hasMore = false
          }

          // 如果已经获取了所有文章（允许一定误差）
          if (totalCount > 0 && allArticles.length >= totalCount - 5) {
            hasMore = false
          }

          // 随机延迟，避免请求过快（增加到4-6秒）
          await this.delay(5000, 0.2)
        } else {
          // 空结果，可能是真的没有了
          if (pageCount === 1) {
            console.log(`  没有找到文章`)
          }
          hasMore = false
        }
      } catch (error) {
        consecutiveErrors++
        console.error(`  第 ${pageCount + 1} 页获取失败 (错误 ${consecutiveErrors}/${maxConsecutiveErrors}):`, (error as Error).message)

        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.log(`  连续 ${maxConsecutiveErrors} 次错误，停止获取`)
          break
        }

        // 继续尝试下一页，但等待更长时间
        begin += size
        await this.delay(3000, 0.3) // 失败后等待更长时间
      }
    }

    if (pageCount >= maxPages) {
      console.log(`  警告: 达到最大页数限制 (${maxPages} 页)，可能还有更多文章未获取`)
    }

    console.log(`  共获取 ${allArticles.length} 篇文章 (${pageCount} 页)${totalCount > 0 ? ` / 预期 ${totalCount} 篇` : ''}`)

    // 检查是否获取了所有文章
    if (totalCount > 0 && allArticles.length < totalCount - 10) {
      console.log(`  ⚠️ 警告: 可能遗漏了 ${totalCount - allArticles.length} 篇文章`)
    }

    return allArticles
  }

  /**
   * 下载文章内容（带重试）
   */
  async downloadArticle(url: string, options: DownloadOptions = { format: 'markdown' }): Promise<string> {
    return this.withRetry(
      async () => {
        const encodedUrl = encodeURIComponent(url)
        const response = await this.client.get('/api/public/v1/download', {
          params: {
            url: encodedUrl,
            format: options.format
          }
        })
        return response.data
      },
      '下载文章'
    )
  }

  /**
   * 获取公众号主体信息
   */
  async getAuthorInfo(fakeid: string): Promise<Record<string, unknown>> {
    return this.withRetry(
      async () => {
        const response = await this.client.get('/api/public/beta/authorinfo', {
          params: { fakeid }
        })
        return response.data
      },
      '获取公众号信息'
    )
  }

  /**
   * 延迟函数（带随机抖动）
   */
  private delay(baseMs: number, jitterRatio: number = 0.3): Promise<void> {
    const jitter = baseMs * jitterRatio * (Math.random() * 2 - 1)
    const actualDelay = Math.max(100, Math.floor(baseMs + jitter))
    return new Promise(resolve => setTimeout(resolve, actualDelay))
  }
}
