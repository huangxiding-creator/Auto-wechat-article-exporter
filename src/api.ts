/**
 * 微信公众号文章导出器 - API 客户端
 */

import axios, { AxiosInstance } from 'axios'
import { AccountInfo, ArticleMessage, SearchResult, DownloadOptions } from './types'

const BASE_URL = 'https://down.mptext.top'

export class WeChatAPI {
  private client: AxiosInstance
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        'X-Auth-Key': apiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
  }

  /**
   * 根据关键字搜索公众号
   */
  async searchAccount(keyword: string, begin: number = 0, size: number = 20): Promise<SearchResult> {
    const response = await this.client.get('/api/public/v1/account', {
      params: { keyword, begin, size }
    })
    return response.data
  }

  /**
   * 根据文章链接搜索公众号
   */
  async searchAccountByUrl(url: string): Promise<AccountInfo> {
    const response = await this.client.get('/api/public/v1/accountbyurl', {
      params: { url }
    })
    return response.data
  }

  /**
   * 获取公众号历史文章列表
   */
  async getArticles(fakeid: string, begin: number = 0, size: number = 20): Promise<ArticleMessage> {
    const response = await this.client.get('/api/public/v1/article', {
      params: { fakeid, begin, size }
    })
    return response.data
  }

  /**
   * 获取所有历史文章（分页获取）
   */
  async getAllArticles(fakeid: string, progressCallback?: (current: number, total: number) => void): Promise<ArticleMessage['articles']> {
    const allArticles: ArticleMessage['articles'] = []
    let begin = 0
    const size = 20
    let hasMore = true
    let pageCount = 0
    const maxPages = 100 // 安全限制，防止无限循环

    console.log(`  开始分页获取文章...`)

    while (hasMore && pageCount < maxPages) {
      const result = await this.getArticles(fakeid, begin, size)
      pageCount++

      if (result.articles && result.articles.length > 0) {
        allArticles.push(...result.articles)

        if (progressCallback) {
          progressCallback(allArticles.length, allArticles.length)
        }

        // 移动到下一页
        begin += size

        // 如果返回的文章数小于请求的size，说明没有更多了
        hasMore = result.articles.length === size

        // 避免请求过快
        await this.delay(500)
      } else {
        hasMore = false
      }
    }

    if (pageCount >= maxPages) {
      console.log(`  警告: 达到最大页数限制 (${maxPages} 页)`)
    }

    return allArticles
  }

  /**
   * 下载文章内容
   * 注意：此接口不需要 API 密钥
   */
  async downloadArticle(url: string, options: DownloadOptions = { format: 'markdown' }): Promise<string> {
    const encodedUrl = encodeURIComponent(url)
    const response = await this.client.get('/api/public/v1/download', {
      params: {
        url: encodedUrl,
        format: options.format
      }
    })
    return response.data
  }

  /**
   * 获取公众号主体信息
   */
  async getAuthorInfo(fakeid: string): Promise<Record<string, unknown>> {
    const response = await this.client.get('/api/public/beta/authorinfo', {
      params: { fakeid }
    })
    return response.data
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
