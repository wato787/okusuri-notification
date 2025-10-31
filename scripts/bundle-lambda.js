import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import archiver from 'archiver'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// ディレクトリとファイルのパス
const distDir = path.join(projectRoot, 'dist')
const packageJsonPath = path.join(projectRoot, 'package.json')
const bunLockPath = path.join(projectRoot, 'bun.lock')
const lambdaZipPath = path.join(projectRoot, 'lambda.zip')
const layerZipPath = path.join(projectRoot, 'webpush-layer.zip')
const layerTempDir = path.join(projectRoot, '.lambda-layer-temp')

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

  const { tempDir, layerRoot } = prepareLayerDependencies()

  try {
    await createZip(layerZipPath, (archive) => {
      console.log('nodejs/ ディレクトリをレイヤーに追加中...')
      archive.directory(layerRoot, 'nodejs')
    })
  } finally {
    cleanupTempDir(tempDir)
  }
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

function prepareLayerDependencies() {
  console.log('Lambda Layer 用の依存関係を準備中...')

  cleanupTempDir(layerTempDir)
  fs.mkdirSync(layerTempDir, { recursive: true })

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json が見つかりません')
  }

  fs.copyFileSync(packageJsonPath, path.join(layerTempDir, 'package.json'))
  if (fs.existsSync(bunLockPath)) {
    fs.copyFileSync(bunLockPath, path.join(layerTempDir, 'bun.lock'))
  }

  const packageManager = detectPackageManager()
  console.log(`使用するパッケージマネージャー: ${packageManager}`)

  if (packageManager === 'bun') {
    const bunSuccess = tryInstallWithBun(layerTempDir)
    if (!bunSuccess) {
      if (!isCommandAvailable('npm')) {
        throw new Error('bun の production インストールに失敗し、npm も利用できません')
      }
      console.warn('bun の production インストールに失敗したため npm にフォールバックします')
      installWithNpm(layerTempDir)
    }
  } else {
    installWithNpm(layerTempDir)
  }

  const tempNodeModulesDir = path.join(layerTempDir, 'node_modules')
  if (!fs.existsSync(tempNodeModulesDir)) {
    throw new Error('node_modules の生成に失敗しました')
  }

  const layerRoot = path.join(layerTempDir, 'nodejs')
  fs.mkdirSync(layerRoot, { recursive: true })
  fs.renameSync(tempNodeModulesDir, path.join(layerRoot, 'node_modules'))
  fs.copyFileSync(packageJsonPath, path.join(layerRoot, 'package.json'))

  return { tempDir: layerTempDir, layerRoot }
}

function detectPackageManager() {
  if (isCommandAvailable('bun')) {
    return 'bun'
  }
  if (isCommandAvailable('npm')) {
    return 'npm'
  }
  throw new Error('bun または npm が見つかりません。依存関係をインストールできません。')
}

function isCommandAvailable(command) {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
  })

  return result.error === undefined && result.status === 0
}

function runCommand(command, args, cwd) {
  console.log(`> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} の実行に失敗しました (終了コード ${result.status})`)
  }
}

function cleanupTempDir(targetDir) {
  if (targetDir && fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true })
  }
}

function cleanupNodeModules(targetDir) {
  const nodeModulesPath = path.join(targetDir, 'node_modules')
  if (fs.existsSync(nodeModulesPath)) {
    fs.rmSync(nodeModulesPath, { recursive: true, force: true })
  }
}

function tryInstallWithBun(cwd) {
  try {
    runCommand('bun', ['install', '--production'], cwd)
    return true
  } catch (error) {
    console.warn('bun install --production の実行に失敗しました:', error instanceof Error ? error.message : error)
    cleanupNodeModules(cwd)
    return false
  }
}

function installWithNpm(cwd) {
  const packageLockPath = path.join(projectRoot, 'package-lock.json')
  if (fs.existsSync(packageLockPath)) {
    fs.copyFileSync(packageLockPath, path.join(cwd, 'package-lock.json'))
    runCommand('npm', ['ci', '--omit=dev'], cwd)
  } else {
    runCommand('npm', ['install', '--omit=dev'], cwd)
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

