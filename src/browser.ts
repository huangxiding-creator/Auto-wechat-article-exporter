/**
 * 微信公众号文章导出器 - 浏览器自动化模块
 */

import { chromium, Page, BrowserContext, Browser, Response } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'

const ACCOUNT_URL = 'https://down.mptext.top/dashboard/account'
const API_URL = 'https://down.mptext.top/dashboard/api'

// 存储cookies的文件路径
const COOKIES_FILE = path.join(process.cwd(), '.browser-data', 'cookies.json')

export class BrowserAuth {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  /**
   * 初始化浏览器 - 只创建一个实例
   */
  async init(): Promise<void> {
    console.log('  正在启动浏览器...')

    // 确保之前的实例已关闭
    await this.close()

    try {
      // 启动浏览器
      this.browser = await chromium.launch({
        headless: false,
        timeout: 90000
      })

      // 创建新的浏览器上下文
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'zh-CN'
      })

      // 尝试加载已保存的 cookies
      await this.loadCookies()

      // 创建新页面
      this.page = await this.context.newPage()

      console.log('  浏览器启动成功')
    } catch (error) {
      console.error('  浏览器启动失败:', (error as Error).message)
      throw error
    }
  }

  /**
   * 确保 page 可用
   */
  private async ensurePage(): Promise<Page> {
    if (!this.page || this.page.isClosed()) {
      if (!this.context) {
        throw new Error('浏览器上下文不可用')
      }
      this.page = await this.context.newPage()
      await this.loadCookies()
    }
    return this.page
  }

  /**
   * 安全导航到页面（带重试）
   */
  private async safeGoto(url: string, retries: number = 5): Promise<boolean> {
    const page = await this.ensurePage()

    for (let i = 0; i < retries; i++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForTimeout(3000)
        return true
      } catch (error) {
        console.log(`  导航重试 ${i + 1}/${retries}...`)
        await page.waitForTimeout(5000)
      }
    }
    return false
  }

  /**
   * 加载已保存的 cookies
   */
  private async loadCookies(): Promise<void> {
    try {
      if (fs.existsSync(COOKIES_FILE) && this.context) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'))
        if (cookies.length > 0) {
          await this.context.addCookies(cookies)
          console.log('  已加载保存的登录状态')
        }
      }
    } catch (error) {
      console.log('  加载 cookies 失败:', (error as Error).message)
    }
  }

  /**
   * 保存 cookies
   */
  private async saveCookies(): Promise<void> {
    try {
      if (this.context) {
        const cookies = await this.context.cookies()
        const dir = path.dirname(COOKIES_FILE)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2))
        console.log('  已保存登录状态')
      }
    } catch (error) {
      console.log('  保存 cookies 失败:', (error as Error).message)
    }
  }

  /**
   * 检查是否已登录
   */
  async checkLoginStatus(): Promise<boolean> {
    const page = await this.ensurePage()

    try {
      await page.goto(ACCOUNT_URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.waitForTimeout(5000)

      // 检查是否存在登录按钮
      const loginButton = await page.$('text=登录公众号')
      return loginButton === null
    } catch (error) {
      console.log('页面加载提示:', (error as Error).message)
      await page.waitForTimeout(3000)
      try {
        const loginButton = await page.$('text=登录公众号')
        return loginButton === null
      } catch {
        return false
      }
    }
  }

  /**
   * 等待用户扫码登录
   */
  async waitForLogin(): Promise<void> {
    const page = await this.ensurePage()

    console.log('\n📱 请在浏览器中扫描二维码登录公众号...')
    console.log('⏳ 等待登录完成（最多等待3分钟）...\n')

    // 点击登录按钮
    try {
      const loginButton = await page.waitForSelector('text=登录公众号', { timeout: 5000 })
      if (loginButton) {
        await loginButton.click()
        console.log('✓ 已点击登录按钮，请扫描二维码...')
      }
    } catch {
      // 可能已经在登录流程中
    }

    // 等待登录成功
    try {
      await page.waitForSelector('text=登录公众号', { state: 'hidden', timeout: 180000 })
    } catch {
      // 检查是否已登录
    }

    await page.waitForTimeout(3000)
    await this.saveCookies()
    console.log('✅ 登录成功！')
  }

  /**
   * 确保 API 密钥有效 - 自动获取
   */
  async ensureApiKey(): Promise<string> {
    const page = await this.ensurePage()

    // 检查登录状态
    let isLoggedIn = await this.checkLoginStatus()

    if (!isLoggedIn) {
      await this.waitForLogin()
      isLoggedIn = true
    }

    // 首先尝试从 cookies 获取 API 密钥
    console.log('\n📋 检查 cookies 中的 API 密钥...')
    const cookieApiKey = await this.getApiKeyFromCookies()
    if (cookieApiKey && cookieApiKey.length >= 20) {
      console.log(`✓ 从 cookies 获取到 API 密钥: ${cookieApiKey.substring(0, 8)}...${cookieApiKey.substring(cookieApiKey.length - 8)}`)
      // 验证密钥
      const isValid = await this.validateApiKey(cookieApiKey)
      if (isValid) {
        console.log('✓ Cookie API 密钥验证成功')
        return cookieApiKey
      } else {
        console.log('⚠ Cookie API 密钥验证失败，尝试其他方式...')
      }
    }

    // 尝试多次获取 API 密钥
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`\n🔄 尝试获取 API 密钥 (${attempt}/3)...`)

      // 导航到 API 页面
      console.log('  导航到 API 页面...')
      await this.safeGoto(API_URL)
      await page.waitForTimeout(5000)

      // 尝试获取 API 密钥
      let apiKey = await this.getApiKeyAutomatically()

      if (apiKey && apiKey.length >= 20) {
        // 验证 API 密钥是否有效
        console.log(`  验证 API 密钥: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}`)
        const isValid = await this.validateApiKey(apiKey)
        if (isValid) {
          console.log('✓ API 密钥验证成功')
          return apiKey
        } else {
          console.log('⚠ API 密钥验证失败，尝试重新获取...')
        }
      } else {
        console.log('  未能自动获取 API 密钥')
      }

      // 如果失败，尝试重新登录
      if (attempt < 3) {
        console.log('\n⚠ 获取失败，等待5秒后重试...')
        await page.waitForTimeout(5000)
      }
    }

    // 最后尝试从 cookies 获取
    const finalCookieKey = await this.getApiKeyFromCookies()
    if (finalCookieKey && finalCookieKey.length >= 20) {
      const isValid = await this.validateApiKey(finalCookieKey)
      if (isValid) {
        return finalCookieKey
      }
    }

    // 提示用户手动输入
    console.log('\n' + '='.repeat(60))
    console.log('⚠️ 自动获取 API 密钥失败')
    console.log('='.repeat(60))
    console.log('请在浏览器中查看 API 密钥页面，找到显示的 API 密钥')
    console.log('然后手动输入密钥（按 Enter 跳过以退出）:')
    console.log('='.repeat(60))

    // 使用 readline 获取用户输入
    const readline = require('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    return new Promise((resolve, reject) => {
      rl.question('请输入 API 密钥: ', async (input: string) => {
        rl.close()
        const key = input.trim()
        if (key && key.length >= 20) {
          // 验证用户输入的密钥
          console.log('  验证您输入的密钥...')
          const isValid = await this.validateApiKey(key)
          if (isValid) {
            console.log('✓ 您输入的 API 密钥有效')
            resolve(key)
          } else {
            reject(new Error('您输入的 API 密钥无效'))
          }
        } else {
          reject(new Error('无法获取有效的 API 密钥'))
        }
      })
    })
  }

  /**
   * 验证 API 密钥是否有效
   */
  private async validateApiKey(apiKey: string): Promise<boolean> {
    const url = 'https://down.mptext.top/api/public/v1/account?keyword=test&begin=0&size=1'

    return new Promise((resolve) => {
      const req = https.request(url, {
        method: 'GET',
        headers: {
          'X-Auth-Key': apiKey,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          // 如果返回 200 或者没有认证错误，则密钥有效
          if (res.statusCode === 200 && !data.includes('认证信息无效')) {
            resolve(true)
          } else {
            console.log(`  API 返回: ${data.substring(0, 200)}`)
            resolve(false)
          }
        })
      })
      req.on('error', () => resolve(false))
      req.setTimeout(10000, () => {
        req.destroy()
        resolve(false)
      })
      req.end()
    })
  }

  /**
   * 自动获取 API 密钥 - 监听网络请求
   */
  async getApiKeyAutomatically(): Promise<string | null> {
    const page = await this.ensurePage()

    try {
      await page.waitForTimeout(2000)

      // 设置网络请求监听，捕获 API 响应中的密钥
      const capturedKey = { value: '' }
      const allResponses: string[] = [] // 记录所有响应用于调试
      let authKeyNotFound = false // 标记 authkey API 是否返回 "not found"

      // 监听所有响应
      const responseHandler = async (response: Response) => {
        const url = response.url()
        try {
          const responseText = await response.text()

          // 检查是否是 authkey API 返回 "not found"
          if (url.includes('/api/public/v1/authkey')) {
            if (responseText.includes('AuthKey not found') || responseText.includes('"code":-1')) {
              authKeyNotFound = true
              console.log(`  ⚠ authkey API 返回: AuthKey not found`)
              console.log(`  这可能意味着需要重新登录或账号没有 API 权限`)
            } else {
              // 尝试从成功响应中提取密钥
              const keyMatch = responseText.match(/"key"\s*:\s*"([a-f0-9]{20,})"/i)
              if (keyMatch && keyMatch[1]) {
                capturedKey.value = keyMatch[1]
                console.log(`✓ 从 authkey API 响应捕获到密钥: ${capturedKey.value.substring(0, 8)}...`)
              }
            }
          }

          // 记录所有包含可能信息的响应
          if (url.includes('mptext.top') || url.includes('api') || url.includes('key') || url.includes('auth')) {
            allResponses.push(`URL: ${url}\nResponse: ${responseText.substring(0, 500)}`)
          }

          // 检查是否是返回 API 密钥的请求
          // 尝试多种匹配模式
          const patterns = [
            /["']?(?:auth[-_]?key|api[-_]?key|key)["']?\s*[:=]\s*["']?([a-f0-9]{20,})/i,
            /"key"\s*:\s*"([a-f0-9]{20,})"/i,
            /"authKey"\s*:\s*"([a-f0-9]{20,})"/i,
            /"data"\s*:\s*"([a-f0-9]{20,})"/i,
            /"result"\s*:\s*"([a-f0-9]{20,})"/i,
            /(?:key|密钥)[：:\s]*["']?([a-f0-9]{20,})/i
          ]

          for (const pattern of patterns) {
            const keyMatch = responseText.match(pattern)
            if (keyMatch && keyMatch[1] && keyMatch[1].length >= 20) {
              capturedKey.value = keyMatch[1]
              console.log(`✓ 从网络响应捕获到 API 密钥: ${capturedKey.value.substring(0, 8)}... (来源: ${url})`)
              break
            }
          }
        } catch {
          // 忽略解析错误
        }
      }

      page.on('response', responseHandler)

      // 监听 dialog 事件（alert/confirm/prompt）
      const dialogHandler = async (dialog: any) => {
        const message = dialog.message()
        console.log(`\n  捕获到弹窗消息: ${message}`)
        // 尝试从弹窗消息中提取密钥
        const keyMatch = message.match(/([a-f0-9]{20,})/i)
        if (keyMatch && keyMatch[1]) {
          capturedKey.value = keyMatch[1]
          console.log(`✓ 从弹窗捕获到 API 密钥: ${capturedKey.value.substring(0, 8)}...`)
        }
        await dialog.dismiss()
      }
      page.on('dialog', dialogHandler)

      // 尝试点击查询按钮
      const buttonSelectors = [
        'button:has-text("查询 API密钥")',
        'button:has-text("查询 API 密钥")',
        'button:has-text("查询")',
        'text=查询 API密钥',
        'text=查询 API 密钥'
      ]

      let buttonClicked = false

      for (const selector of buttonSelectors) {
        try {
          const button = await page.$(selector)
          if (button) {
            const isVisible = await button.isVisible()
            if (isVisible) {
              await button.click()
              console.log('✓ 已点击查询 API 密钥按钮')
              buttonClicked = true
              await page.waitForTimeout(5000) // 等待更长时间让请求完成
              break
            }
          }
        } catch {
          // 继续尝试下一个选择器
        }
      }

      if (!buttonClicked) {
        // 通过 JavaScript 查找并点击按钮
        const clicked = await page.evaluate(() => {
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
          await page.waitForTimeout(5000)
        }
      }

      // 等待更长时间让请求完成
      await page.waitForTimeout(3000)

      // 移除事件监听
      page.off('response', responseHandler)
      page.off('dialog', dialogHandler)

      // 如果 authkey API 返回 "not found"，说明需要手动操作
      if (authKeyNotFound) {
        console.log('\n  ⚠️ 检测到 API 密钥未生成')
        console.log('  可能的原因:')
        console.log('  1. 需要在网站上手动点击"查询 API 密钥"按钮')
        console.log('  2. 账号可能没有 API 访问权限')
        console.log('  3. 登录会话可能已过期')
        console.log('\n  请尝试手动操作:')
        console.log('  1. 在浏览器中访问 https://down.mptext.top/dashboard/api')
        console.log('  2. 点击"查询 API 密钥"按钮')
        console.log('  3. 如果显示密钥，请复制并手动输入\n')
        // 返回 null 触发手动输入流程
        return null
      }

      // 打印捕获的响应用于调试
      if (allResponses.length > 0) {
        console.log(`\n  捕获到 ${allResponses.length} 个相关响应:`)
        for (let i = 0; i < allResponses.length; i++) {
          console.log(`  --- 响应 ${i + 1} ---`)
          console.log(allResponses[i])
        }
      } else {
        console.log('  未捕获到任何相关响应')
      }

      // 尝试从弹窗/dialog 获取密钥
      try {
        const dialogContent = await page.evaluate(() => {
          // 检查是否有 alert/confirm/prompt 弹窗结果
          // 检查是否有 toast/notification 消息
          const toasts = document.querySelectorAll('.toast, .notification, .message, [class*="toast"], [class*="message"]')
          for (const toast of toasts) {
            const text = toast.textContent || ''
            const keyMatch = text.match(/([a-f0-9]{20,})/i)
            if (keyMatch) {
              return keyMatch[1]
            }
          }

          // 检查是否有 modal 弹窗
          const modals = document.querySelectorAll('.modal, [class*="modal"], [role="dialog"]')
          for (const modal of modals) {
            const text = modal.textContent || ''
            const keyMatch = text.match(/([a-f0-9]{20,})/i)
            if (keyMatch) {
              return keyMatch[1]
            }
          }

          return null
        })

        if (dialogContent && dialogContent.length >= 20) {
          console.log(`✓ 从弹窗内容获取到密钥: ${dialogContent.substring(0, 8)}...`)
          return dialogContent
        }
      } catch {
        // 忽略错误
      }

      // 如果从网络请求中捕获到了密钥，直接使用
      if (capturedKey.value && capturedKey.value.length >= 20) {
        console.log(`✓ 使用网络捕获的 API 密钥: ${capturedKey.value.substring(0, 8)}...${capturedKey.value.substring(capturedKey.value.length - 8)}`)
        return capturedKey.value
      }

      // 否则从页面提取
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
    const page = await this.ensurePage()

    try {
      // 等待页面内容加载
      await page.waitForTimeout(3000)

      // 先截图保存当前页面状态
      try {
        const screenshotPath = path.join(process.cwd(), '.browser-data', 'api-page.png')
        await page.screenshot({ path: screenshotPath, fullPage: true })
        console.log(`  已保存页面截图: ${screenshotPath}`)
      } catch {
        // 忽略截图错误
      }

      const apiKeyText = await page.evaluate(() => {
        const allText = document.body.innerText
        const allHtml = document.body.innerHTML

        // 方式1: 检查 localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('auth') || key.includes('key') || key.includes('api'))) {
            const value = localStorage.getItem(key)
            if (value && /^[a-f0-9]{20,}$/i.test(value)) {
              console.log(`[页面] 从 localStorage.${key} 找到密钥`)
              return value
            }
          }
        }

        // 方式2: 查找"当前密钥"文本后的值
        const currentKeyMatch = allText.match(/当前密钥[：:\s]*([a-f0-9]{32,})/i)
        if (currentKeyMatch && currentKeyMatch[1]) {
          return currentKeyMatch[1]
        }

        // 方式3: 查找"密钥"相关的各种格式
        const keyPatterns = [
          /密钥[：:\s]*["']?([a-f0-9]{20,})/i,
          /API\s*密钥[：:\s]*["']?([a-f0-9]{20,})/i,
          /Key[：:\s]*["']?([a-f0-9]{20,})/i,
          /auth[-_]?key[：:\s]*["']?([a-f0-9]{20,})/i,
          /X-Auth-Key[：:\s]*["']?([a-f0-9]{20,})/i,
          /您的密钥[：:\s]*["']?([a-f0-9]{20,})/i,
          /密钥为[：:\s]*["']?([a-f0-9]{20,})/i
        ]
        for (const pattern of keyPatterns) {
          const match = allText.match(pattern)
          if (match && match[1]) {
            return match[1]
          }
        }

        // 方式4: 在 HTML 中查找隐藏的密钥
        const htmlKeyPatterns = [
          /value\s*=\s*["']([a-f0-9]{32,})["']/i,
          /data-key\s*=\s*["']([a-f0-9]{32,})["']/i,
          /data-api-key\s*=\s*["']([a-f0-9]{32,})["']/i,
          /"key"\s*:\s*"([a-f0-9]{32,})"/i,
          /"apiKey"\s*:\s*"([a-f0-9]{32,})"/i,
          /"authKey"\s*:\s*"([a-f0-9]{32,})"/i
        ]
        for (const pattern of htmlKeyPatterns) {
          const match = allHtml.match(pattern)
          if (match && match[1]) {
            return match[1]
          }
        }

        // 方式5: 查找32位以上的十六进制字符串（排除常见的哈希值）
        const hexPattern = /[a-f0-9]{32,}/gi
        const matches = allText.match(hexPattern)
        if (matches && matches.length > 0) {
          // 过滤掉看起来像哈希的字符串，优先选择更长的
          const validKeys = matches.filter(m => m.length >= 32 && m.length <= 64)
          if (validKeys.length > 0) {
            return validKeys.sort((a, b) => b.length - a.length)[0]
          }
        }

        // 方式6: 查找 input 元素
        const inputs = document.querySelectorAll('input')
        for (const input of inputs) {
          const value = input.getAttribute('value') || (input as HTMLInputElement).value
          if (value && value.length >= 20 && /^[a-f0-9]+$/i.test(value)) {
            return value
          }
        }

        // 方式7: 查找带有 "密钥" 文本的元素
        const allElements = Array.from(document.querySelectorAll('*'))
        for (const el of allElements) {
          const text = el.textContent || ''
          if (text.includes('密钥') || text.includes('Key') || text.includes('key')) {
            const match = text.match(/[a-f0-9]{20,}/i)
            if (match) {
              return match[0]
            }
          }
        }

        // 方式8: 查找 code 或 pre 元素中的内容
        const codeElements = document.querySelectorAll('code, pre, .key, .api-key, #api-key')
        for (const el of codeElements) {
          const text = el.textContent || ''
          const match = text.match(/[a-f0-9]{20,}/i)
          if (match) {
            return match[0]
          }
        }

        // 方式9: 查找 data-* 属性
        const elementsWithData = document.querySelectorAll('[data-key], [data-api-key], [data-auth-key]')
        for (const el of elementsWithData) {
          const key = el.getAttribute('data-key') || el.getAttribute('data-api-key') || el.getAttribute('data-auth-key')
          if (key && /^[a-f0-9]{20,}$/i.test(key)) {
            return key
          }
        }

        // 方式10: 检查 sessionStorage
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key && (key.includes('auth') || key.includes('key') || key.includes('api'))) {
            const value = sessionStorage.getItem(key)
            if (value && /^[a-f0-9]{20,}$/i.test(value)) {
              return value
            }
          }
        }

        return null
      })

      if (apiKeyText) {
        console.log(`✓ API 密钥提取成功: ${apiKeyText.substring(0, 8)}...${apiKeyText.substring(apiKeyText.length - 8)}`)
      } else {
        console.log('⚠ 未能从页面提取 API 密钥')
        console.log('  页面内容预览:', (await page.evaluate(() => document.body.innerText)).substring(0, 500))
      }

      return apiKeyText ?? null
    } catch (error) {
      console.log('提取 API 密钥失败:', (error as Error).message)
      return null
    }
  }

  /**
   * 从浏览器 cookies 中获取 API 密钥
   */
  async getApiKeyFromCookies(): Promise<string | null> {
    if (!this.context) return null

    try {
      const cookies = await this.context.cookies()
      console.log(`  当前 cookies 数量: ${cookies.length}`)

      // 打印所有 cookie 名称（用于调试）
      const cookieNames = cookies.map(c => c.name).join(', ')
      console.log(`  Cookie 名称: ${cookieNames}`)

      // 尝试多种可能的 cookie 名称 - 只使用明确的 API 密钥名称
      const possibleNames = ['auth-key', 'auth_key', 'apikey', 'api_key', 'x-auth-key']
      for (const name of possibleNames) {
        const cookie = cookies.find(c => c.name.toLowerCase() === name.toLowerCase())
        if (cookie && cookie.value && cookie.value.length >= 20 && /^[a-f0-9]+$/i.test(cookie.value)) {
          console.log(`✓ 从 cookie '${name}' 获取到 API 密钥`)
          return cookie.value
        }
      }

      // 不再从 uuid 或其他 session cookies 获取密钥
      return null
    } catch {
      return null
    }
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close()
      }
      if (this.browser) {
        await this.browser.close()
      }
    } catch {
      // 忽略关闭错误
    }
    this.browser = null
    this.context = null
    this.page = null
  }
}
