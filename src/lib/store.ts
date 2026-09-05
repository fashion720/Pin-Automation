import { readJson, writeJson } from "./kv";

import type { PinStyleOverrides } from "./pinStyle";

export interface Pin {
  id: string;
  templateId: string;
  templateName: string;
  imageUrl: string;
  overlayText: string;
  keywords: string[];
  /** Original scraped article image URLs this pin was composed from —
   *  needed to regenerate the image if the overlay text is edited later.
   *  Empty for manually-uploaded pins (nothing to regenerate from). */
  sourceImageUrls?: string[];
  /** The exact article URL whose image pool produced this pin. */
  sourceArticleUrl?: string;
  /** User-selected visual overrides used when the pin is regenerated. */
  styleOverrides?: PinStyleOverrides;
  /** Pinterest import metadata; legacy pins may not have these fields. */
  pinTitle?: string;
  description?: string;
  altText?: string;
  tags?: string[];
  scheduledAt?: string;
  scheduleGroupId?: string;
  scheduleStatus?: "draft" | "scheduled" | "exported";
}

export interface Post {
  id: string;
  title: string;
  articleUrl: string;
  createdAt: string;
  /** Batch/folder ownership; absent on legacy posts until migrated. */
  batchId?: string;
  pins: Pin[];
}

const KEY = "posts";

async function readAll(): Promise<Post[]> {
  return readJson<Post[]>(KEY, []);
}

async function writeAll(posts: Post[]) {
  await writeJson(KEY, posts);
}

export async function getAllPosts(): Promise<Post[]> {
  const posts = await readAll();
  return posts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function addPost(post: Post): Promise<Post> {
  const posts = await readAll();
  posts.push(post);
  await writeAll(posts);
  return post;
}

export async function updatePost(id: string, updates: Partial<Post>): Promise<Post | undefined> {
  const posts = await readAll();
  const post = posts.find((item) => item.id === id);
  if (!post) return undefined;
  Object.assign(post, updates);
  await writeAll(posts);
  return post;
}

export async function getPost(id: string): Promise<Post | undefined> {
  const posts = await readAll();
  return posts.find((p) => p.id === id);
}

export async function getPostsByBatchId(batchId: string): Promise<Post[]> {
  const posts = await readAll();
  return posts
    .filter((post) => post.batchId === batchId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function deletePost(id: string) {
  const posts = await readAll();
  await writeAll(posts.filter((p) => p.id !== id));
}

export async function deletePosts(ids: string[], batchId?: string): Promise<number> {
  const wanted = new Set(ids);
  const posts = await readAll();
  const remaining = posts.filter((post) => !(wanted.has(post.id) && (!batchId || post.batchId === batchId)));
  await writeAll(remaining);
  return posts.length - remaining.length;
}

export async function movePostsToBatch(ids: string[], targetBatchId: string, sourceBatchId?: string): Promise<number> {
  const wanted = new Set(ids);
  const posts = await readAll();
  let moved = 0;
  for (const post of posts) {
    if (wanted.has(post.id) && (!sourceBatchId || post.batchId === sourceBatchId)) {
      post.batchId = targetBatchId;
      moved++;
    }
  }
  await writeAll(posts);
  return moved;
}

export async function updatePinInPost(
  postId: string,
  pinId: string,
  updates: Partial<Pin>
): Promise<Post | undefined> {
  const posts = await readAll();
  const post = posts.find((p) => p.id === postId);
  if (!post) return undefined;
  post.pins = post.pins.map((pin) => (pin.id === pinId ? { ...pin, ...updates } : pin));
  await writeAll(posts);
  return post;
}

export async function removePinFromPost(postId: string, pinId: string): Promise<Post | undefined> {
  const posts = await readAll();
  const post = posts.find((p) => p.id === postId);
  if (!post) return undefined;
  post.pins = post.pins.filter((pin) => pin.id !== pinId);
  await writeAll(posts);
  return post;
}

/** Flat list of every pin across every post — this is what the CSV export walks. */
export async function getAllPinsFlat() {
  const posts = await readAll();
  return posts.flatMap((post) =>
          post.pins.map((pin) => ({
        postId: post.id,
        batchId: post.batchId,
        postTitle: post.title,

      articleUrl: post.articleUrl,
      createdAt: post.createdAt,
      ...pin,
    }))
  );
}
