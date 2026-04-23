/**
 * 微信公众号文章导出器 - API 客户端
 * V3.0 - 生产级：断路器、速率限制、结构化日志
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { AccountInfo, ArticleMessage, SearchResult, DownloadOptions } from './types'
import { RateLimiter, CircuitBreaker, CircuitState } from './rate-limiter'
import { logger } from './structured-logger'
import { config } from './config'

const BASE_URL = config.getSection('api').baseUrl

interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: config.getSection('api').maxRetries,
  baseDelay: config.getSection('api').baseDelay,
  maxDelay: config.getSection('api').maxDelay
}

export class WeChatAPI {
  private client: AxiosInstance
  private retryConfig: RetryConfig
  private warmupDone = false
  private currentDelay = 500 // 自适应延迟（速率限制器控制节奏）
  private consecutive429 = 0 // 连续429错误计数
  private rateLimiter: RateLimiter
  private circuitBreaker: CircuitBreaker

  constructor(apiKey: string, retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig }
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: config.getSection('api').timeout,
      headers: {
        'X-Auth-Key': apiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    // 初始化速率限制器和断路器
    const rateLimitConfig = config.getSection('rateLimit')
    this.rateLimiter = new RateLimiter(rateLimitConfig)

    const circuitConfig = config.getSection('circuitBreaker')
    this.circuitBreaker = new CircuitBreaker(circuitConfig)

    logger.debug('API 客户端初始化完成', { baseUrl: BASE_URL })
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
   * 带重试的请求包装器（集成断路器和速率限制）
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const { maxRetries, maxDelay } = { ...this.retryConfig, ...config }
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 检查断路器状态
      if (!this.circuitBreaker.canExecute()) {
        throw new Error(`${operationName}: 服务暂时不可用（断路器断开）`)
      }

      // 等待速率限制
      await this.rateLimiter.waitForSlot()

      try {
        const result = await operation()

        // 成功：报告给速率限制器和断路器
        this.rateLimiter.reportSuccess()
        this.circuitBreaker.reportSuccess()
        this.consecutive429 = 0
        this.currentDelay = Math.max(300, this.currentDelay * 0.9)

        logger.debug(`${operationName} 成功`)
        return result
      } catch (error) {
        lastError = error as Error

        // 检测429限流错误
        if (error instanceof AxiosError && error.response?.status === 429) {
          this.rateLimiter.report429()
          this.circuitBreaker.reportFailure()
          this.consecutive429++
          this.currentDelay = Math.min(10000, this.currentDelay * 2)
          logger.warn(`${operationName}: 限流检测`, { attempt: attempt + 1, delay: this.currentDelay })
        } else {
          this.rateLimiter.reportError()
          this.circuitBreaker.reportFailure()
        }

        // 如果是4xx错误（除了429），不重试
        if (error instanceof AxiosError && error.response) {
          const status = error.response.status
          if (status >= 400 && status < 500 && status !== 429) {
            throw error
          }
        }

        if (attempt < maxRetries) {
          const delay = Math.min(
            this.currentDelay * Math.pow(1.5, attempt) + Math.random() * 500,
            maxDelay
          )
          logger.warn(`${operationName} 失败，${Math.floor(delay / 1000)}秒后重试`, {
            attempt: attempt + 1,
            maxRetries: maxRetries + 1
          })
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
    const size = 20 // API每页最大20篇
    let hasMore = true
    let pageCount = 0
    const maxPages = 1000 // 支持最多20000篇文章（每页20）
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

          // 只在没有 next_offset 时用文章数量判断是否结束
          if (result.next_offset === undefined || result.next_offset === null) {
            if (result.articles.length < size) {
              hasMore = false
            }
          }

          // 如果已经获取了所有文章（允许一定误差）
          if (totalCount > 0 && allArticles.length >= totalCount - 5) {
            hasMore = false
          }

          // 延迟由速率限制器 waitForSlot() 控制，无需额外等待
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
        await this.delay(1500, 0.2) // 失败后短暂等待
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
   * 健康检查
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    circuitBreaker: CircuitState
    rateLimiter: { delay: number; consecutive429: number }
    latency?: number
  }> {
    const circuitState = this.circuitBreaker.getState()
    const rateLimitStatus = this.rateLimiter.getStatus()

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    let latency: number | undefined

    // 测试 API 连通性
    try {
      const start = Date.now()
      await this.client.get('/api/public/v1/account', {
        params: { keyword: 'test', begin: 0, size: 1 },
        timeout: 5000
      })
      latency = Date.now() - start
    } catch {
      status = 'unhealthy'
    }

    // 根据断路器状态调整
    if (circuitState === CircuitState.OPEN) {
      status = 'unhealthy'
    } else if (circuitState === CircuitState.HALF_OPEN) {
      status = 'degraded'
    }

    // 根据速率限制状态调整
    if (rateLimitStatus.consecutive429 >= 3) {
      status = status === 'healthy' ? 'degraded' : status
    }

    return {
      status,
      circuitBreaker: circuitState,
      rateLimiter: rateLimitStatus,
      latency
    }
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    this.circuitBreaker.reset()
    this.rateLimiter.reset()
    this.currentDelay = 500
    this.consecutive429 = 0
    this.warmupDone = false
    logger.info('API 客户端状态已重置')
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
