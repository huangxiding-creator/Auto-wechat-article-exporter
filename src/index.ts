#!/usr/bin/env node
/**
 * 微信公众号文章导出器 - 主入口
 *
 * 功能:
 * 1. 自动打开浏览器并提醒用户扫码登录
 * 2. 登录成功后自动获取 API 密钥
 * 3. 读取公众号名称列表
 * 4. 批量下载所有历史文章为 Markdown 格式
 * 5. 下载完成后，合并 Markdown 文件（每500个文件合并为一个）
 */

// 加载环境变量
import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { exec } from 'child_process'
import { program } from 'commander'
import chalk from 'chalk'
import axios from 'axios'
import { BrowserAuth } from './browser'
import { ArticleDownloader } from './downloader'

const DEFAULT_ACCOUNT_LIST = '公众号名称列表.txt'
const DEFAULT_DOWNLOAD_DIR = 'Downloads'
const API_KEY_FILE = '.api-key'

// 版本信息
const VERSION = '1.2.0'

/**
 * 从命令行读取用户输入
 */
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * 保存 API 密钥到文件
 */
function saveApiKey(apiKey: string): void {
  try {
    fs.writeFileSync(API_KEY_FILE, apiKey, 'utf-8')
    console.log(chalk.gray('  API 密钥已保存到本地'))
  } catch (error) {
    console.log(chalk.yellow('  保存 API 密钥失败:', (error as Error).message))
  }
}

/**
 * 从文件加载 API 密钥
 */
function loadApiKey(): string | null {
  try {
    if (fs.existsSync(API_KEY_FILE)) {
      const key = fs.readFileSync(API_KEY_FILE, 'utf-8').trim()
      if (key && key.length >= 20) {
        return key
      }
    }
  } catch {
    // 忽略错误
  }
  return null
}

/**
 * 检查 API Key 是否有效
 */
async function checkApiKeyValid(apiKey: string): Promise<boolean> {
  try {
    const response = await axios.get('https://down.mptext.top/api/public/v1/account', {
      params: { keyword: 'test', begin: 0, size: 1 },
      headers: {
        'X-Auth-Key': apiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    })
    const data = response.data
    // 有效响应应该是 JSON 对象，不是 HTML
    if (typeof data === 'string' && data.includes('<!DOCTYPE')) return false
    if (data?.base_resp?.ret === -1) return false
    return true
  } catch {
    return false
  }
}

/**
 * 打开浏览器让用户获取 API Key
 */
function openBrowserForApiKey(): void {
  const url = 'https://down.mptext.top/dashboard/account'
  console.log(chalk.cyan('\n🌐 正在打开浏览器...'))
  console.log(chalk.yellow('请在浏览器中扫码登录，然后复制 API 密钥'))
  const command = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  exec(`${command} "${url}"`, (err) => {
    if (err) {
      console.log(chalk.yellow(`无法自动打开浏览器，请手动访问: ${url}`))
    }
  })
}

async function main() {
  // 解析命令行参数
  program
    .version(VERSION)
    .option('-a, --account-list <file>', '公众号名称列表文件', DEFAULT_ACCOUNT_LIST)
    .option('-o, --output <dir>', '下载目录', DEFAULT_DOWNLOAD_DIR)
    .option('-k, --api-key <key>', 'API 密钥（可选）')
    .option('-p, --port <number>', 'Web 界面端口', '3000')
    .option('--manual', '手动输入 API 密钥模式')
    .option('--skip-browser', '跳过浏览器自动化，直接使用保存的或手动输入的 API 密钥')
    .option('--merge-only', '仅执行合并操作（不下载）')
    .option('--web', '启动 Web 可视化界面模式')
    .parse(process.argv)

  const options = program.opts()

  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════╗'))
  console.log(chalk.bold.cyan('║    微信公众号文章批量下载器 v' + VERSION + '          ║'))
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝\n'))

  // Web 可视化界面模式（不影响纯脚本模式）
  if (options.web) {
    const { createWebServer } = require('./web/server')
    const port = parseInt(options.port, 10) || 3000
    createWebServer(port)
    console.log(chalk.green('  Web 可视化界面已启动，浏览器将自动打开'))
    console.log(chalk.gray('  纯脚本模式请使用: npm start (不加 --web)'))
    return
  }

  try {
    const downloadDir = path.resolve(options.output)

    // 如果只是合并模式
    if (options.mergeOnly) {
      const downloader = new ArticleDownloader('', downloadDir)
      await downloader.mergeAllArticles()
      console.log(chalk.bold.green('\n✨ 合并完成！\n'))
      return
    }

    // 读取公众号名称列表
    const accountListPath = path.resolve(options.accountList)

    if (!fs.existsSync(accountListPath)) {
      console.error(chalk.red(`错误: 找不到公众号名称列表文件: ${accountListPath}`))
      console.log(chalk.yellow('\n请创建一个包含公众号名称的文本文件（每行一个名称）'))
      console.log(chalk.yellow(`默认文件路径: ${DEFAULT_ACCOUNT_LIST}`))
      process.exit(1)
    }

    const accountNames = fs.readFileSync(accountListPath, 'utf-8')
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0 && !name.startsWith('#'))

    if (accountNames.length === 0) {
      console.error(chalk.red('错误: 公众号名称列表为空'))
      process.exit(1)
    }

    console.log(chalk.gray(`读取到 ${accountNames.length} 个公众号: ${accountNames.join(', ')}\n`))

    // 获取 API 密钥 (优先级: 命令行参数 > 环境变量 > 本地文件 > 浏览器自动获取)
    let apiKey = options.apiKey || process.env.WECHAT_API_KEY || loadApiKey()

    // 如果启用了 skip-browser 选项，直接使用手动输入
    if (options.skipBrowser && !apiKey) {
      console.log(chalk.cyan('\n📋 跳过浏览器模式 - 请手动输入 API 密钥\n'))
      console.log(chalk.gray('请按照以下步骤获取 API 密钥:'))
      console.log(chalk.gray('1. 打开浏览器访问 https://down.mptext.top/dashboard/account'))
      console.log(chalk.gray('2. 点击 "登录公众号" 并扫码登录'))
      console.log(chalk.gray('3. 登录成功后访问 https://down.mptext.top/dashboard/api'))
      console.log(chalk.gray('4. 点击 "查询 API 密钥" 按钮'))
      console.log(chalk.gray('5. 复制显示的 API 密钥\n'))

      apiKey = await promptUser('请粘贴 API 密钥: ')

      if (!apiKey || apiKey.length < 20) {
        console.error(chalk.red('错误: API 密钥无效'))
        process.exit(1)
      }

      saveApiKey(apiKey)
    } else if (!apiKey && !options.manual) {
      console.log(chalk.cyan('🔐 正在初始化浏览器...\n'))

      const browserAuth = new BrowserAuth()
      await browserAuth.init()

      try {
        // 先检查是否已登录
        const isLoggedIn = await browserAuth.checkLoginStatus()

        if (!isLoggedIn) {
          console.log(chalk.yellow('请在打开的浏览器窗口中完成以下操作:'))
          console.log(chalk.yellow('1. 点击 "登录公众号" 按钮'))
          console.log(chalk.yellow('2. 使用微信扫描二维码登录'))
          console.log(chalk.yellow('3. 登录成功后，程序将自动获取 API 密钥\n'))

          // 等待用户登录
          await browserAuth.waitForLogin()
        } else {
          console.log(chalk.green('✓ 检测到已登录状态'))
        }

        // 自动获取 API 密钥（会自动导航到 API 页面并点击查询按钮）
        console.log(chalk.cyan('\n🔑 正在自动获取 API 密钥...\n'))
        apiKey = await browserAuth.ensureApiKey()

        if (apiKey) {
          console.log(chalk.green(`✓ API 密钥获取成功: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}`))
          saveApiKey(apiKey)
        }
      } catch (error) {
        console.log(chalk.yellow('\n⚠ 自动获取 API 密钥失败'))
        console.log(chalk.yellow('请手动输入 API 密钥\n'))

        apiKey = await promptUser('请输入 API 密钥: ')

        if (!apiKey || apiKey.length < 20) {
          console.error(chalk.red('错误: API 密钥无效'))
          process.exit(1)
        }

        // 保存手动输入的 API 密钥
        saveApiKey(apiKey)
      } finally {
        await browserAuth.close()
      }
    } else if (options.manual) {
      console.log(chalk.cyan('\n📋 手动输入 API 密钥模式\n'))
      console.log(chalk.gray('请按照以下步骤获取 API 密钥:'))
      console.log(chalk.gray('1. 打开浏览器访问 https://down.mptext.top/dashboard/account'))
      console.log(chalk.gray('2. 点击 "登录公众号" 并扫码登录'))
      console.log(chalk.gray('3. 登录成功后访问 https://down.mptext.top/dashboard/api'))
      console.log(chalk.gray('4. 点击 "查询 API 密钥" 按钮'))
      console.log(chalk.gray('5. 复制显示的 API 密钥\n'))

      apiKey = await promptUser('请粘贴 API 密钥: ')

      if (!apiKey || apiKey.length < 20) {
        console.error(chalk.red('错误: API 密钥无效'))
        process.exit(1)
      }

      // 保存手动输入的 API 密钥
      saveApiKey(apiKey)
    }

    if (!apiKey) {
      console.error(chalk.red('错误: 未提供 API 密钥'))
      process.exit(1)
    }

    // 检查 API Key 是否有效
    console.log(chalk.cyan('🔑 正在验证 API 密钥...'))
    const isValid = await checkApiKeyValid(apiKey)
    if (!isValid) {
      console.log(chalk.red('✗ API 密钥已失效或无效'))
      openBrowserForApiKey()
      apiKey = await promptUser('\n请输入新的 API 密钥: ')
      if (!apiKey || apiKey.length < 20) {
        console.error(chalk.red('错误: API 密钥无效'))
        process.exit(1)
      }
      saveApiKey(apiKey)
      // 再次验证
      const recheck = await checkApiKeyValid(apiKey)
      if (!recheck) {
        console.error(chalk.red('错误: 新的 API 密钥仍然无效，请确认后重试'))
        process.exit(1)
      }
    }
    console.log(chalk.green('✓ API 密钥验证通过'))

    // 初始化下载器
    const downloader = new ArticleDownloader(apiKey, downloadDir)

    // 1. 首先下载所有文章（每个账号下载完会自动增量合并）
    await downloader.downloadMultipleAccounts(accountNames)

    console.log(chalk.bold.green('\n✨ 全部完成！\n'))
    console.log(chalk.gray(`文章已保存到: ${downloadDir}\n`))

  } catch (error) {
    console.error(chalk.red('\n❌ 发生错误:'))
    console.error(error)
    process.exit(1)
  }
}

// 运行主程序
main()
