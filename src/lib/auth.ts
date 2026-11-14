const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return new Uint8Array(digest);
}

/**
 * 定数時間で文字列を比較する。
 * 一致・不一致にかかわらず常に全バイトを走査するため、応答時間から内容を推測できない。
 * 先に SHA-256 で固定長に潰すので、文字列長の違いも漏れない。
 */
async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) diff |= hashA[i]! ^ hashB[i]!;
  return diff === 0;
}

/** ログインフォームの入力を、設定された認証情報と定数時間で照合する */
export async function verifyCredentials(
  user: string,
  password: string,
  expectedUser: string,
  expectedPassword: string,
): Promise<boolean> {
  // 認証情報が未設定なら誰も通さない（fail closed）
  if (!expectedUser || !expectedPassword) return false;

  // 片方の結果で早期 return せず、常に両方を計算する
  const [userMatches, passwordMatches] = await Promise.all([
    constantTimeEquals(user, expectedUser),
    constantTimeEquals(password, expectedPassword),
  ]);
  return userMatches && passwordMatches;
}
