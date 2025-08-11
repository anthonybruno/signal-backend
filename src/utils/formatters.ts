import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';

import type { SpotifyTrackData } from '@/services/mcpResponseService';
import { MESSAGES } from '@/utils/messages';

/**
 * Formats raw Spotify data into structured format
 */
export function formatSpotifyData(spotifyData: Record<string, unknown>): {
  data: SpotifyTrackData;
  formatted: string;
} {
  const data: SpotifyTrackData = {
    track: spotifyData.name as string,
    artist: (spotifyData.artists as Array<{ name: string }>)[0]?.name,
    album: (spotifyData.album as { name: string }).name,
    url: (spotifyData.external_urls as { spotify: string }).spotify,
    played_at: spotifyData.played_at as string,
  };

  const formatted = formatSpotifyResponse(data);
  return { data, formatted };
}

/**
 * Formats Spotify response in a user-friendly way
 */
function formatSpotifyResponse(data: SpotifyTrackData): string {
  if (data.error) {
    return data.error;
  }

  if (!data.track || !data.artist) {
    return MESSAGES.spotify.noTrack;
  }

  let timeAgo = '';
  if (data.played_at) {
    try {
      timeAgo = formatDistanceToNow(new Date(data.played_at), {
        addSuffix: true,
      });
    } catch {
      timeAgo = '';
    }
  }

  return `About **${timeAgo}** I listened 💿 to: [${data.track} by ${data.artist}](${data.url})`;
}

/**
 * Formats raw GitHub data into structured format
 */
export function formatGitHubData(githubData: Record<string, unknown>): {
  data: Record<string, unknown>;
  formatted: string;
} {
  const data = githubData;
  const formatted = formatGitHubResponse(data);
  return { data, formatted };
}

/**
 * Formats GitHub response in a user-friendly way
 */
function formatGitHubResponse(data: Record<string, unknown>): string {
  if (data.error) {
    return data.error as string;
  }

  if (!data.activity || !data.profile) {
    return MESSAGES.github.noActivity;
  }

  const profile = data.profile as Record<string, unknown>;
  const activity = data.activity as Array<Record<string, unknown>>;

  if (!profile.login || !activity.length) {
    return MESSAGES.github.noProfile;
  }

  const username = profile.login as string;
  const recentActivity = activity
    .slice(0, 3)
    .map((event) => {
      const { type, repo } = event as { type: string; repo?: { name: string } };
      const repoName = repo?.name || 'unknown repo';
      return `- ${type} in ${repoName}`;
    })
    .join('\n');

  return `**${username}** on GitHub:\n\n${recentActivity}`;
}

/**
 * Formats raw blog data into structured format
 */
export function formatBlogData(blogData: Record<string, unknown>): {
  data: Record<string, unknown>;
  formatted: string;
} {
  const data = blogData;
  const formatted = formatBlogResponse(data);
  return { data, formatted };
}

/**
 * Formats blog response in a user-friendly way
 */
function formatBlogResponse(data: Record<string, unknown>): string {
  if (data.error) {
    return data.error as string;
  }

  if (!data.posts || !Array.isArray(data.posts) || data.posts.length === 0) {
    return MESSAGES.blog.noPosts;
  }

  const posts = data.posts as Array<Record<string, unknown>>;
  const [latestPost] = posts;

  if (!latestPost.title || !latestPost.url) {
    return MESSAGES.blog.error;
  }

  const title = latestPost.title as string;
  const url = latestPost.url as string;
  const publishedAt = latestPost.publishedAt as string;

  let timeAgo = '';
  if (publishedAt) {
    try {
      timeAgo = formatDistanceToNow(new Date(publishedAt), {
        addSuffix: true,
      });
    } catch {
      timeAgo = '';
    }
  }

  return `My latest blog post **${timeAgo}**: [${title}](${url})`;
}

/**
 * Formats raw project data into structured format
 */
export function formatProjectData(projectData: Record<string, unknown>): {
  data: Record<string, unknown>;
  formatted: string;
} {
  const data = projectData;
  const formatted = formatProjectResponse(data);
  return { data, formatted };
}

/**
 * Formats project response in a user-friendly way
 */
function formatProjectResponse(data: Record<string, unknown>): string {
  if (data.error) {
    return data.error as string;
  }

  if (!data.name || !data.description) {
    return 'Project information not available.';
  }

  const name = data.name as string;
  const description = data.description as string;
  const url = data.url as string;
  const stars = data.stars as number;
  const language = data.language as string;

  let formatted = `**${name}**\n\n${description}`;

  if (url) {
    formatted += `\n\n[View on GitHub](${url})`;
  }

  if (stars) {
    formatted += `\n⭐ ${stars} stars`;
  }

  if (language) {
    formatted += `\n💻 ${language}`;
  }

  return formatted;
}
