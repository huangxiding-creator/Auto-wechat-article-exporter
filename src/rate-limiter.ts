/**
 * 智能速率限制器
 * 实现 Token Bucket 算法 + 自适应调整
 */

export interface RateLimiterConfig {
  maxRequests: number       // 时间窗口内最大请求数
  windowMs: number          // 时间窗口（毫秒）
  minDelay: number          // 最小延迟（毫秒）
  maxDelay: number          // 最大延迟（毫秒）
  backoffMultiplier: number // 退避乘数
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequests: 30,          // 每分钟30个请求
  windowMs: 60000,          // 1分钟窗口
  minDelay: 300,            // 最小0.3秒延迟
  maxDelay: 30000,          // 最大30秒延迟
  backoffMultiplier: 1.5    // 退避乘数
}

export class RateLimiter {
  private config: RateLimiterConfig
  private tokens: number
  private lastRefill: number
  private currentDelay: number
  private consecutive429: number = 0
  private requestTimestamps: number[] = []

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.tokens = this.config.maxRequests
    this.lastRefill = Date.now()
    this.currentDelay = this.config.minDelay
  }

  /**
   * 获取下一个请求的延迟时间
   */
  async waitForSlot(): Promise<void> {
    this.refillTokens()

    // 检查滑动窗口内的请求数
    const now = Date.now()
    this.requestTimestamps = this.requestTimestamps.filter(t => t > now - this.config.windowMs)

    if (this.requestTimestamps.length >= this.config.maxRequests) {
      // 等待直到最早的请求过期
      const oldestRequest = this.requestTimestamps[0]!
      const waitTime = oldestRequest + this.config.windowMs - now + 100
      await this.delay(waitTime)
    }

    // 应用当前延迟
    await this.delay(this.currentDelay)

    // 记录本次请求
    this.requestTimestamps.push(Date.now())
  }

  /**
   * 报告成功请求
   */
  reportSuccess(): void {
    this.consecutive429 = 0
    // 逐渐减少延迟
    this.currentDelay = Math.max(
      this.config.minDelay,
      this.currentDelay * 0.9
    )
  }

  /**
   * 报告429错误
   */
  report429(): void {
    this.consecutive429++
    // 指数退避
    this.currentDelay = Math.min(
      this.config.maxDelay,
      this.currentDelay * Math.pow(this.config.backoffMultiplier, this.consecutive429)
    )
    console.log(`  ⚠️ 限流检测 (#${this.consecutive429})，延迟调整为 ${Math.floor(this.currentDelay / 1000)}秒`)
  }

  /**
   * 报告其他错误
   */
  reportError(): void {
    // 轻微增加延迟
    this.currentDelay = Math.min(
      this.config.maxDelay,
      this.currentDelay * 1.2
    )
  }

  /**
   * 获取当前状态
   */
  getStatus(): { delay: number; consecutive429: number; availableTokens: number } {
    this.refillTokens()
    return {
      delay: this.currentDelay,
      consecutive429: this.consecutive429,
      availableTokens: this.tokens
    }
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.tokens = this.config.maxRequests
    this.lastRefill = Date.now()
    this.currentDelay = this.config.minDelay
    this.consecutive429 = 0
    this.requestTimestamps = []
  }

  private refillTokens(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const tokensToAdd = Math.floor(elapsed / this.config.windowMs * this.config.maxRequests)

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.config.maxRequests, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }

  private delay(ms: number): Promise<void> {
    const jitter = ms * 0.1 * (Math.random() * 2 - 1)
    const actualDelay = Math.max(100, Math.floor(ms + jitter))
    return new Promise(resolve => setTimeout(resolve, actualDelay))
  }
}

/**
 * 断路器模式实现
 */
export enum CircuitState {
  CLOSED = 'CLOSED',     // 正常状态
  OPEN = 'OPEN',         // 断开状态（拒绝请求）
  HALF_OPEN = 'HALF_OPEN' // 半开状态（试探性请求）
}

export interface CircuitBreakerConfig {
  failureThreshold: number  // 失败阈值
  successThreshold: number  // 成功阈值（半开状态）
  timeout: number           // 断开状态持续时间（毫秒）
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 15,     // 15次失败才断开（更宽容）
  successThreshold: 3,
  timeout: 120000           // 2分钟后恢复
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig
  private state: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private successCount: number = 0
  private lastFailureTime: number = 0

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config }
  }

  /**
   * 检查是否允许请求
   */
  canExecute(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true

      case CircuitState.OPEN:
        // 检查是否应该尝试半开
        if (Date.now() - this.lastFailureTime >= this.config.timeout) {
          this.state = CircuitState.HALF_OPEN
          this.successCount = 0
          console.log('  🔄 断路器进入半开状态')
          return true
        }
        return false

      case CircuitState.HALF_OPEN:
        return true

      default:
        return false
    }
  }

  /**
   * 报告成功
   */
  reportSuccess(): void {
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED
        this.successCount = 0
        console.log('  ✅ 断路器恢复正常')
      }
    }
  }

  /**
   * 报告失败
   */
  reportFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      // 半开状态下失败，立即断开
      this.state = CircuitState.OPEN
      console.log('  🔴 断路器重新断开（半开状态失败）')
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN
      console.log(`  🔴 断路器断开（连续失败 ${this.failureCount} 次）`)
    }
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * 重置断路器
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0
  }
}
