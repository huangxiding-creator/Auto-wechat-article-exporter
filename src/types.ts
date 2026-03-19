/**
 * 微信公众号文章导出器 - 类型定义
 */

export interface AccountInfo {
  fakeid: string
  nickname: string
  alias: string
  round_head_img: string
  service_type: number
  description: string
  is_verify: number
}

export interface Article {
  aid: string
  title: string
  link: string
  cover: string
  content_url: string
  source_url: string
  digest: string
  create_time: number
  update_time: number
  author_name: string
  appmsgid: number
  itemidx: number
}

export interface ArticleMessage {
  app_msg_cnt: number  // 文章总数
  articles: Article[]  // 文章列表
  base_resp: {
    ret: number
    err_msg: string
  }
  next_offset: number  // 下一页偏移量
  ret: number
  err_msg: string
}

export interface SearchResult {
  total: number
  list: AccountInfo[]
}

export interface DownloadOptions {
  format: 'html' | 'markdown' | 'text' | 'json'
}

export interface ExportConfig {
  apiKey: string
  baseUrl: string
  downloadDir: string
  accountListFile: string
}

export interface ArticleContent {
  title: string
  content: string
  url: string
  author: string
  createTime: number
}
