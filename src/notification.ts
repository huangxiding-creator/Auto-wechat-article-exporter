/**
 * 微信公众号文章导出器 - 企业微信通知模块
 */

import axios from 'axios'

export interface NotificationConfig {
  webhookUrl: string
  enabled: boolean
}

export interface DownloadResult {
  accountName: string
  totalArticles: number
  downloadedArticles: number
  failedArticles: number
  mergedFiles: number
  mergedFileSize: string
  duration: number
}

export class NotificationService {
  private config: NotificationConfig

  constructor(webhookUrl?: string) {
    this.config = {
      webhookUrl: webhookUrl || process.env.WEWORK_WEBHOOK_URL || '',
      enabled: !!(webhookUrl || process.env.WEWORK_WEBHOOK_URL)
    }
  }

  /**
   * 发送企业微信消息
   */
  async sendMessage(content: string): Promise<boolean> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      console.log('[通知] 企业微信通知未配置，跳过发送')
      return false
    }

    try {
      const response = await axios.post(
        this.config.webhookUrl,
        {
          msgtype: 'markdown',
          markdown: {
            content
          }
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data?.errcode === 0) {
        console.log('[通知] 企业微信消息发送成功')
        return true
      } else {
        console.error('[通知] 企业微信消息发送失败:', response.data?.errmsg)
        return false
      }
    } catch (error) {
      console.error('[通知] 发送企业微信消息时出错:', error)
      return false
    }
  }

  /**
   * 发送下载完成通知
   */
  async sendDownloadCompleteNotification(result: DownloadResult): Promise<boolean> {
    const durationMinutes = Math.floor(result.duration / 60)
    const durationSeconds = result.duration % 60
    const durationStr = durationMinutes > 0
      ? `${durationMinutes}分${durationSeconds}秒`
      : `${durationSeconds}秒`

    const status = result.failedArticles === 0 ? '✅ 成功' : '⚠️ 部分失败'
    const content = `## 📥 公众号文章下载完成

**公众号**: ${result.accountName}
**状态**: ${status}

> 📊 **下载统计**
> - 文章总数: ${result.totalArticles} 篇
> - 成功下载: ${result.downloadedArticles} 篇
> - 下载失败: ${result.failedArticles} 篇
> - 合并文件: ${result.mergedFiles} 个
> - 文件大小: ${result.mergedFileSize}
> - 耗时: ${durationStr}

---
*微信公众号文章批量下载器 v1.2.0*`

    return this.sendMessage(content)
  }

  /**
   * 发送批量下载完成通知
   */
  async sendBatchCompleteNotification(
    results: DownloadResult[],
    totalDuration: number
  ): Promise<boolean> {
    const totalArticles = results.reduce((sum, r) => sum + r.totalArticles, 0)
    const totalDownloaded = results.reduce((sum, r) => sum + r.downloadedArticles, 0)
    const totalFailed = results.reduce((sum, r) => sum + r.failedArticles, 0)
    const totalMerged = results.reduce((sum, r) => sum + r.mergedFiles, 0)

    const hours = Math.floor(totalDuration / 3600)
    const minutes = Math.floor((totalDuration % 3600) / 60)
    const seconds = totalDuration % 60
    const durationStr = hours > 0
      ? `${hours}时${minutes}分${seconds}秒`
      : minutes > 0
        ? `${minutes}分${seconds}秒`
        : `${seconds}秒`

    const accountList = results
      .map(r => `> - ${r.accountName}: ${r.downloadedArticles}篇`)
      .join('\n')

    const status = totalFailed === 0 ? '✅ 全部成功' : '⚠️ 部分失败'
    const content = `## 🎉 批量下载任务完成

**公众号数量**: ${results.length} 个
**总体状态**: ${status}

> 📊 **总体统计**
> - 文章总数: ${totalArticles} 篇
> - 成功下载: ${totalDownloaded} 篇
> - 下载失败: ${totalFailed} 篇
> - 合并文件: ${totalMerged} 个
> - 总耗时: ${durationStr}

> 📋 **各账号详情**
${accountList}

---
*微信公众号文章批量下载器 v1.2.0*`

    return this.sendMessage(content)
  }

  /**
   * 发送错误通知
   */
  async sendErrorNotification(accountName: string, error: string): Promise<boolean> {
    const content = `## ❌ 下载任务失败

**公众号**: ${accountName}
**错误信息**: ${error}

---
*微信公众号文章批量下载器 v1.2.0*`

    return this.sendMessage(content)
  }

  /**
   * 检查通知服务是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled
  }
}
