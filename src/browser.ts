/**
 * 微信公众号文章导出器 - 浏览器自动化模块
 */

import { chromium, Page, BrowserContext } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const ACCOUNT_URL = 'https://down.mptext.top/dashboard/account'
const API_URL = 'https://down.mptext.top/dashboard/api'

// 存储用户数据的目录
const USER_DATA_DIR = path.join(process.cwd(), '.browser-data')

export class BrowserAuth {
  private context: BrowserContext | null = null
  private page: Page | null = null

  /**
   * 初始化浏览器
   */
  async init(): Promise<void> {
    // 确保用户数据目录存在
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true })
    }

    // 使用持久化上下文以保存登录状态
    this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN',
      timeout: 90000,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    })

    // 获取或创建页面
    const pages = this.context.pages()
    this.page = pages.length > 0 ? pages[0] ?? null : await this.context.newPage()
  }

  /**
   * 检查是否已登录
   */
  async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false

    try {
      // 使用 domcontentloaded 事件，更快
      await this.page.goto(ACCOUNT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

      // 等待页面主要内容加载
      await this.page.waitForTimeout(3000)

      // 检查是否存在登录按钮
      const loginButton = await this.page.$('text=登录公众号')

      // 如果登录按钮不可见或不存在，说明已登录
      return loginButton === null
    } catch (error) {
      console.log('页面加载提示:', (error as Error).message)
      // 即使超时也尝试检查页面状态
      await this.page.waitForTimeout(2000)
      const loginButton = await this.page.$('text=登录公众号')
      return loginButton === null
    }
  }

  /**
   * 退出登录 - 清除登录状态以确保获取新的 API 密钥
   */
  async logout(): Promise<void> {
    if (!this.page) return

    console.log('\n🔄 正在清除登录状态以确保获取新的 API 密钥...')

    try {
      // 导航到账号页面
      await this.page.goto(ACCOUNT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await this.page.waitForTimeout(2000)

      // 尝试查找并点击退出登录按钮
      const logoutSelectors = [
        'button:has-text("退出")',
        'button:has-text("登出")',
        'text=退出登录',
        'text=退出',
        '[class*="logout"]',
        '[class*="sign-out"]'
      ]

      for (const selector of logoutSelectors) {
        try {
          const logoutButton = await this.page.$(selector)
          if (logoutButton) {
            const isVisible = await logoutButton.isVisible()
            if (isVisible) {
              await logoutButton.click()
              console.log('✓ 已点击退出登录按钮')
              await this.page.waitForTimeout(2000)
              return
            }
          }
        } catch {
          // 继续尝试下一个选择器
        }
      }

      // 如果没找到退出按钮，尝试通过 JavaScript 清除 cookies
      console.log('  未找到退出按钮，尝试清除登录 cookies...')

      if (this.context) {
        const cookies = await this.context.cookies()
        const authCookies = cookies.filter(c =>
          c.name.includes('auth') ||
          c.name.includes('session') ||
          c.name.includes('token') ||
          c.name === 'auth-key'
        )

        if (authCookies.length > 0) {
          // 清除认证相关的 cookies
          const client = await this.context.newCDPSession(this.page)
          for (const cookie of authCookies) {
            try {
              await client.send('Network.deleteCookies', {
                name: cookie.name,
                domain: cookie.domain
              })
            } catch {
              // 忽略错误
            }
          }
          console.log(`✓ 已清除 ${authCookies.length} 个登录 cookies`)
        }
      }

      // 刷新页面
      await this.page.reload()
      await this.page.waitForTimeout(2000)

    } catch (error) {
      console.log('  清除登录状态时出错:', (error as Error).message)
      // 即使出错也继续，让用户重新登录
    }
  }

  /**
   * 等待用户扫码登录
   */
  async waitForLogin(): Promise<void> {
    if (!this.page) {
      throw new Error('浏览器未初始化')
    }

    console.log('\n📱 请在浏览器中扫描二维码登录公众号...')
    console.log('⏳ 等待登录完成（最多等待3分钟）...\n')

    // 点击登录按钮
    try {
      const loginButton = await this.page.waitForSelector('text=登录公众号', { timeout: 5000 })
      if (loginButton) {
        await loginButton.click()
        console.log('✓ 已点击登录按钮，请扫描二维码...')
      }
    } catch {
      // 可能已经在登录流程中
    }

    // 等待登录成功 - 检测登录按钮消失或出现用户信息
    try {
      // 等待登录按钮消失
      await this.page.waitForSelector('text=登录公众号', { state: 'hidden', timeout: 180000 })
    } catch {
      // 检查是否已登录
    }

    // 等待页面稳定
    await this.page.waitForTimeout(3000)

    console.log('✅ 登录成功！')
  }

  /**
   * 确保 API 密钥有效 - 自动获取
   */
  async ensureApiKey(): Promise<string> {
    if (!this.page) {
      throw new Error('浏览器未初始化')
    }

    // 检查登录状态
    const isLoggedIn = await this.checkLoginStatus()

    if (isLoggedIn) {
      // 如果已登录，先退出登录以确保获取新的 API 密钥
      console.log('\n检测到已登录状态，为确保 API 密钥有效性...')
      await this.logout()
    }

    // 等待用户重新登录
    await this.waitForLogin()

    // 导航到 API 页面
    console.log('\n正在导航到 API 页面...')
    await this.page.goto(API_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await this.page.waitForTimeout(2000)

    // 尝试获取 API 密钥
    let apiKey = await this.getApiKeyAutomatically()

    if (!apiKey) {
      throw new Error('无法获取 API 密钥，请确保已正确登录')
    }

    return apiKey
  }

  /**
   * 自动获取 API 密钥
   * 1. 点击"查询 API密钥(确保当前登录信息有效)"按钮
   * 2. 提取"当前密钥"的值
   */
  async getApiKeyAutomatically(): Promise<string | null> {
    if (!this.page) return null

    try {
      // 等待页面加载完成
      await this.page.waitForTimeout(2000)

      // 尝试多种按钮选择器
      const buttonSelectors = [
        'button:has-text("查询 API密钥")',
        'button:has-text("查询 API 密钥")',
        'text=查询 API密钥',
        'text=查询 API 密钥',
        '[class*="query"]',
        '[class*="search"]'
      ]

      let buttonClicked = false

      for (const selector of buttonSelectors) {
        try {
          const button = await this.page.$(selector)
          if (button) {
            const isVisible = await button.isVisible()
            if (isVisible) {
              await button.click()
              console.log('✓ 已点击查询 API 密钥按钮')
              buttonClicked = true
              await this.page.waitForTimeout(2000)
              break
            }
          }
        } catch {
          // 继续尝试下一个选择器
        }
      }

      if (!buttonClicked) {
        // 尝试通过 evaluate 查找并点击按钮
        const clicked = await this.page.evaluate(() => {
          const buttons = document.querySelectorAll('button')
          for (const btn of buttons) {
            if (btn.textContent && (
              btn.textContent.includes('查询') ||
              btn.textContent.includes('API密钥') ||
              btn.textContent.includes('API 密钥')
            )) {
              (btn as HTMLElement).click()
              return true
            }
          }
          return false
        })

        if (clicked) {
          console.log('✓ 已通过 JavaScript 点击查询按钮')
          await this.page.waitForTimeout(2000)
        }
      }

      // 提取 API 密钥
      const apiKey = await this.extractApiKey()

      if (apiKey) {
        console.log(`✓ API 密钥获取成功: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}`)
      }

      return apiKey

    } catch (error) {
      console.log('获取 API 密钥时出错:', (error as Error).message)
      return null
    }
  }

  /**
   * 从页面提取 API 密钥
   */
  private async extractApiKey(): Promise<string | null> {
    if (!this.page) return null

    // 尝试多种方式获取密钥
    const apiKeyText = await this.page.evaluate(() => {
      // 方式1: 查找"当前密钥"文本后的值
      const allText = document.body.innerText
      const currentKeyMatch = allText.match(/当前密钥[：:\s]*([a-f0-9]{32,})/i)
      if (currentKeyMatch && currentKeyMatch[1]) {
        return currentKeyMatch[1]
      }

      // 方式2: 查找特定格式的密钥（32位以上的十六进制字符串）
      const hexPattern = /[a-f0-9]{32,}/gi
      const matches = allText.match(hexPattern)
      if (matches && matches.length > 0) {
        // 返回最长的匹配（通常是密钥）
        const longest = matches.sort((a, b) => b.length - a.length)[0]
        if (longest && longest.length >= 32) {
          return longest
        }
      }

      // 方式3: 查找 input 元素
      const inputs = document.querySelectorAll('input')
      for (const input of inputs) {
        const value = input.getAttribute('value') || (input as HTMLInputElement).value
        if (value && value.length >= 20) {
          return value
        }
      }

      // 方式4: 查找带有 "密钥" 文本的元素附近的值
      const allElements = Array.from(document.querySelectorAll('*'))
      for (const el of allElements) {
        const text = el.textContent || ''
        if (text.includes('当前密钥') || text.includes('密钥：') || text.includes('密钥:')) {
          // 尝试提取密钥值
          const match = text.match(/[a-f0-9]{20,}/i)
          if (match) {
            return match[0]
          }
        }
      }

      // 方式5: 查找 code 或 pre 元素
      const codeElements = document.querySelectorAll('code, pre, .key, .api-key, #api-key')
      for (const el of codeElements) {
        const text = el.textContent || ''
        const match = text.match(/[a-f0-9]{20,}/i)
        if (match) {
          return match[0]
        }
      }

      // 方式6: 查找可能包含密钥的 div 或 span
      const textContainers = document.querySelectorAll('div, span, p')
      for (const el of textContainers) {
        const text = el.textContent || ''
        // 检查是否是纯密钥文本
        if (/^[a-f0-9]{32,}$/i.test(text.trim())) {
          return text.trim()
        }
      }

      return null
    })

    return apiKeyText
  }

  /**
   * 从浏览器 cookies 中获取 API 密钥
   */
  async getApiKeyFromCookies(): Promise<string | null> {
    if (!this.context) return null

    try {
      const cookies = await this.context.cookies()
      const authKey = cookies.find(c => c.name === 'auth-key')

      return authKey ? authKey.value : null
    } catch {
      return null
    }
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close()
    }
    this.context = null
    this.page = null
  }
}
