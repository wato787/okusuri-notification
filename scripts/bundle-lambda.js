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

// node_modulesからproduction依存関係を追加
// 注: ネストされた依存関係は通常トップレベルのnode_modulesにインストールされるため、
// production依存関係とそのトップレベルの依存関係を含めます
if (fs.existsSync(nodeModulesDir)) {
  console.log('node_modules/ から依存関係をZIPに追加中...')
  
  // 直接依存関係を追加
  for (const dep of dependencies) {
    const depPath = path.join(nodeModulesDir, dep)
    if (fs.existsSync(depPath)) {
      archive.directory(depPath, path.join('node_modules', dep))
      console.log(`  - ${dep} を追加`)
    }
  }
  
  // web-pushなどの依存関係が必要な場合、node_modules全体をコピーすることも可能ですが、
  // まずはproduction依存関係のみで試してみます
  // 問題がある場合は、以下のコメントを外してnode_modules全体をコピーしてください
  // console.log('node_modules/ 全体をZIPに追加中...')
  // archive.directory(nodeModulesDir, 'node_modules')
} else {
  console.warn('警告: node_modulesディレクトリが見つかりません。')
}

// package.jsonを追加（Lambdaランタイムで必要）
console.log('package.jsonをZIPに追加中...')
archive.file(packageJsonPath, { name: 'package.json' })

// ZIP作成を開始
archive.finalize()

