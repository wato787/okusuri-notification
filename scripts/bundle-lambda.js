import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import archiver from 'archiver'

const execAsync = promisify(exec)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// ディレクトリとファイルのパス
const distDir = path.join(projectRoot, 'dist')
const nodeModulesDir = path.join(projectRoot, 'node_modules')
const packageJsonPath = path.join(projectRoot, 'package.json')
const lambdaZipPath = path.join(projectRoot, 'lambda.zip')
const layerZipPath = path.join(projectRoot, 'webpush-layer.zip')
const layerDepsDir = path.join(projectRoot, '.layer-deps')

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error('エラー: distディレクトリが見つかりません。先に "bun run build" を実行してください。')
    process.exit(1)
  }

  // 既存のZIPファイルを削除
  removeIfExists(lambdaZipPath, '既存のlambda.zipを削除しました')
  removeIfExists(layerZipPath, '既存のwebpush-layer.zipを削除しました')

  await createZip(lambdaZipPath, (archive) => {
    console.log('dist/ ディレクトリをZIPに追加中...')
    archive.directory(distDir, false)

    if (fs.existsSync(packageJsonPath)) {
      console.log('package.jsonをZIPに追加中...')
      archive.file(packageJsonPath, { name: 'package.json' })
    }
  })

  // Layer用にproduction依存関係のみを含むディレクトリを作成
  try {
    await createLayerDependencies()

    const layerNodeModulesDir = path.join(layerDepsDir, 'node_modules')
    if (!fs.existsSync(layerNodeModulesDir)) {
      console.error('エラー: Layer用のnode_modulesディレクトリの作成に失敗しました。')
      process.exit(1)
    }

    await createZip(layerZipPath, (archive) => {
      console.log('production依存関係をレイヤーに追加中...')
      archive.directory(layerNodeModulesDir, 'nodejs/node_modules')

      // package.jsonは元のファイルを使用（production依存関係のみの情報を含む）
      if (fs.existsSync(packageJsonPath)) {
        console.log('nodejs/package.jsonをレイヤーに追加中...')
        archive.file(packageJsonPath, { name: 'nodejs/package.json' })
      }
    })
  } finally {
    // 一時ディレクトリをクリーンアップ（エラーが発生しても実行）
    cleanupLayerDeps()
  }
}

main().catch((error) => {
  console.error('バンドル処理中にエラーが発生しました:', error)
  process.exit(1)
})

async function createLayerDependencies() {
  // 既存の一時ディレクトリを削除
  if (fs.existsSync(layerDepsDir)) {
    fs.rmSync(layerDepsDir, { recursive: true, force: true })
  }

  // 一時ディレクトリを作成
  fs.mkdirSync(layerDepsDir, { recursive: true })

  // package.jsonを一時ディレクトリにコピー
  const layerPackageJsonPath = path.join(layerDepsDir, 'package.json')
  fs.copyFileSync(packageJsonPath, layerPackageJsonPath)

  console.log('production依存関係をインストール中...')
  try {
    // bun install --productionを実行
    const { stdout, stderr } = await execAsync('bun install --production', {
      cwd: layerDepsDir,
    })
    if (stderr && !stderr.includes('warn')) {
      console.warn('インストール警告:', stderr)
    }
    console.log('production依存関係のインストールが完了しました')
  } catch (error) {
    console.error('production依存関係のインストールに失敗しました:', error)
    throw error
  }
}

function cleanupLayerDeps() {
  if (fs.existsSync(layerDepsDir)) {
    fs.rmSync(layerDepsDir, { recursive: true, force: true })
    console.log('一時ディレクトリをクリーンアップしました')
  }
}

function removeIfExists(filePath, message) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    console.log(message)
  }
}

function createZip(outputPath, configureArchive) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', {
      zlib: { level: 9 },
    })

    output.on('close', () => {
      console.log(`✅ ZIPファイルを作成しました: ${outputPath}`)
      console.log(`   ファイルサイズ: ${archive.pointer()} バイト`)
      resolve(undefined)
    })

    archive.on('error', (err) => {
      reject(err)
    })

    archive.pipe(output)
    configureArchive(archive)

    archive.finalize()
  })
}

