import { defineConfig, bytecodePlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [
      bytecodePlugin({
        protectedStrings: [
          // 添加需要保护的敏感字符串
        ],
        // 排除切号功能相关文件，不进行混淆加密
        transformArrowFunctions: true,
        removeLiteralNumbers: false
      })
    ],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'main.js')
        },
        external: [
          'electron',
          'path',
          'fs',
          'os',
          'crypto',
          'http',
          'https',
          'child_process',
          'util',
          'imap',
          'mailparser',
          'sql.js',
          'uuid',
          'axios'
        ]
      }
    }
  },
  // 暂时禁用 preload（项目无 preload 脚本）
  // preload: {
  //   plugins: [bytecodePlugin()],
  //   build: {
  //     outDir: 'dist/preload'
  //   }
  // },
  renderer: {
    root: '.',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    }
  }
})
