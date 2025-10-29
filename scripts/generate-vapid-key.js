#!/usr/bin/env node
/**
 * VAPID鍵生成スクリプト
 * 
 * 使用方法:
 *   node scripts/generate-vapid-key.js
 *   または
 *   bun run scripts/generate-vapid-key.js
 */

async function generateVAPIDKey() {
  try {
    // ECDSA鍵ペアを生成
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['sign']
    )

    // 秘密鍵をJWK形式でエクスポート
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)

    console.log('\n=== VAPID鍵生成完了 ===\n')
    
    console.log('以下の内容を.envファイルまたは.dev.varsファイルに設定してください:\n')
    console.log('VAPID_PRIVATE_KEY=' + JSON.stringify(privateKeyJwk))
    console.log('\n---\n')
    console.log('公開鍵情報（参考）:')
    console.log('x:', privateKeyJwk.x)
    console.log('y:', privateKeyJwk.y)
    console.log('\n=== 完了 ===\n')
  } catch (error) {
    console.error('エラー:', error)
    process.exit(1)
  }
}

generateVAPIDKey()

