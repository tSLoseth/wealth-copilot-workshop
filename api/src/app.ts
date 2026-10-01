// Express app factory - separated from index.ts so tests can import the
// app without binding a real network port.
import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { customersRouter } from './routes/customers.js'
import { reportsRouter } from './routes/reports.js'
import { getAllHoldings, getAllInstruments } from './data.js'
import { loadOpenApiSpec } from './docs.js'

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'wealth-copilot-api', timestamp: new Date().toISOString() })
  })

  // API documentation: interactive Swagger UI + the raw OpenAPI document.
  const openApiSpec = loadOpenApiSpec()
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec)
  })
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec))

  app.use(reportsRouter)
  app.use('/customers', customersRouter)

  // Top-level discovery endpoints for workshop participants.
  app.get('/instruments', (_req, res) => {
    const instruments = getAllInstruments()
    res.json({ count: instruments.length, instruments })
  })

  app.get('/holdings', (_req, res) => {
    const holdings = getAllHoldings()
    res.json({ count: holdings.length, holdings })
  })

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  return app
}
