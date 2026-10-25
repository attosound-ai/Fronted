import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapApiPost } from '../mapApiPost';
import type { FeedApiPost } from '../../types';

// The detail response Anthony's phone got on Oct 25 2026 for a post opened from
// a notification: the counts live under `interactions`.
const DETAIL = {
  id: '6ade4a98efc6bc677c7ee9f2',
  authorId: '191',
  contentType: 'image',
  textContent: 'Maya showing her ATTO support!!',
  filePaths: ['atto/content/content_79f7ae9a9eb4'],
  metadata: { width: '3024', height: '4032' },
  tags: [],
  createdAt: '2026-10-25T18:29:44.080989947+00:00',
  updatedAt: '2026-10-25T18:29:44.080989947+00:00',
  author: {
    id: '191',
    username: 'tom.veilleux',
    displayName: 'tom.veilleux',
    avatar: 'atto/avatars/avatar_e24d5f5aea4f',
    role: 'listener',
  },
  interactions: {
    likesCount: 1,
    commentsCount: 1,
    sharesCount: 0,
    repostsCount: 0,
    isLiked: true,
    isBookmarked: false,
    isReposted: false,
  },
  isFollowingAuthor: true,
} as unknown as FeedApiPost;

test('a post opened on its own keeps its like and comment counts', () => {
  const post = mapApiPost(DETAIL);
  assert.equal(post.likesCount, 1);
  assert.equal(post.commentsCount, 1);
  assert.equal(post.isLiked, true);
  assert.equal(post.isFollowingAuthor, true);
});

test('the text and the raw file paths survive for the detail screen', () => {
  const post = mapApiPost(DETAIL);
  assert.equal(post.textContent, 'Maya showing her ATTO support!!');
  assert.equal(post.content, 'Maya showing her ATTO support!!');
  assert.deepEqual(post.filePaths, ['atto/content/content_79f7ae9a9eb4']);
  assert.equal(post.author.username, 'tom.veilleux');
});

test('a post without interactions shows zero, never undefined', () => {
  const post = mapApiPost({
    ...DETAIL,
    interactions: undefined,
  } as unknown as FeedApiPost);
  assert.equal(post.likesCount, 0);
  assert.equal(post.commentsCount, 0);
});
