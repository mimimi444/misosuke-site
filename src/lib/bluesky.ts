// Bluesky（AT Protocol）の API を知っている唯一の場所。
import { AtpAgent, RichText, type BlobRef } from '@atproto/api';

const SERVICE = 'https://bsky.social';

/** アプリパスワードでログインしたエージェントを返す */
export async function createBlueskyAgent(identifier: string, appPassword: string): Promise<AtpAgent> {
  const agent = new AtpAgent({ service: SERVICE });
  await agent.login({ identifier, password: appPassword });
  return agent;
}

export async function uploadBlob(agent: AtpAgent, bytes: Uint8Array, mimeType: string): Promise<BlobRef> {
  const res = await agent.uploadBlob(bytes, { encoding: mimeType });
  return res.data.blob;
}

export async function createPost(
  agent: AtpAgent,
  params: { text: string; image?: { blob: BlobRef; alt: string } },
): Promise<{ uri: string; cid: string }> {
  // 本文中の URL とハッシュタグを facet に変換する（byte offset は自前で計算しない）
  const rt = new RichText({ text: params.text });
  await rt.detectFacets(agent);

  const res = await agent.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
    ...(params.image && {
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{ image: params.image.blob, alt: params.image.alt }],
      },
    }),
  });
  return { uri: res.uri, cid: res.cid };
}
