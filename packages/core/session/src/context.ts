/** Host Context registration of the Session store; client programs declare their own Session service. */
import type { SessionStore } from './index.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore
  }
}
