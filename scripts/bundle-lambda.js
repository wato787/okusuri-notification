import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import archiver from 'archiver'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// ディレクトリとファイルのパス
const distDir = path.join(projectRoot, 'dist')
const nodeModulesDir = path.join(projectRoot, 'node_modules')
const packageJsonPath = path.join(projectRoot, 'package.json')
const outputZipPath = path.join(projectRoot, 'lambda.zip')

// distディレクトリが存在するか確認
if (!fs.existsSync(distDir)) {
  console.error('エラー: distディレクトリが見つかりません。先に "npm run build" を実行してください。')
  process.exit(1)
}

// 既存のZIPファイルを削除
if (fs.existsSync(outputZipPath)) {
  fs.unlinkSync(outputZipPath)
  console.log('既存のlambda.zipを削除しました')
}

// ZIPファイルを作成
const output = fs.createWriteStream(outputZipPath)
const archive = archiver('zip', {
  zlib: { level: 9 } // 最高圧縮レベル
})

output.on('close', () => {
  console.log(`✅ Lambda用ZIPファイルを作成しました: ${outputZipPath}`)
  console.log(`   ファイルサイズ: ${archive.pointer()} バイト`)
})

archive.on('error', (err) => {
  console.error('ZIP作成エラー:', err)
  process.exit(1)
})

archive.pipe(output)

// package.jsonを読み込んで依存関係を取得
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const dependencies = Object.keys(packageJson.dependencies || {})

// distディレクトリの内容を追加
console.log('dist/ ディレクトリをZIPに追加中...')
archive.directory(distDir, false)

// node_modules全体を追加（production依存関係とそのすべてのネストされた依存関係を含む）
// web-pushなどのライブラリは多くの依存関係を持つため、確実に動作するように全体をコピーします
if (fs.existsSync(nodeModulesDir)) {
  console.log('node_modules/ 全体をZIPに追加中...')
  archive.directory(nodeModulesDir, 'node_modules')
  console.log('  - node_modules全体を追加しました')
} else {
  console.warn('警告: node_modulesディレクトリが見つかりません。')
}

// package.jsonを追加（Lambdaランタイムで必要）
console.log('package.jsonをZIPに追加中...')
archive.file(packageJsonPath, { name: 'package.json' })

// ZIP作成を開始
archive.finalize()

