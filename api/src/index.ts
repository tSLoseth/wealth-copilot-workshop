import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { storageMode } from './services/interactionLog.js'

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'))
} catch {
  // No .env file: rely on the real environment (Render).
}

const PORT = Number(process.env.PORT ?? 3000)
const app = createApp()

app.listen(PORT, () => {
  console.log(`Wealth Copilot API listening on http://localhost:${PORT}`)
  console.log('All data served by this API is 100% synthetic / fictional.')
  console.log(`AI: ${process.env.ANTHROPIC_API_KEY ? 'Claude enabled' : 'no ANTHROPIC_API_KEY, using fallback reports'} · interaction log: ${storageMode()}`)
})
