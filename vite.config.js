import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/klines': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: () => '/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=30',
      },
      '/api/funding': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        rewrite: () => '/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1',
      },
      '/api/ticker': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: () => '/api/v3/ticker/24hr?symbol=BTCUSDT',
      },
    },
  },
})
