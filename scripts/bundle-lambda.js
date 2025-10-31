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
const lambdaZipPath = path.join(projectRoot, 'lambda.zip')
const layerZipPath = path.join(projectRoot, 'webpush-layer.zip')

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

  if (!fs.existsSync(nodeModulesDir)) {
    console.warn('警告: node_modulesディレクトリが見つかりません。レイヤーZIPは作成されません。')
    return
  }

  await createZip(layerZipPath, (archive) => {
    console.log('node_modules/ をレイヤーに追加中...')
    archive.directory(nodeModulesDir, 'nodejs/node_modules')

    if (fs.existsSync(packageJsonPath)) {
      console.log('nodejs/package.jsonをレイヤーに追加中...')
      archive.file(packageJsonPath, { name: 'nodejs/package.json' })
    }
  })
}

main().catch((error) => {
  console.error('バンドル処理中にエラーが発生しました:', error)
  process.exit(1)
})

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

