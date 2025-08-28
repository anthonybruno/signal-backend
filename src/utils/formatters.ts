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

  // Check if we have the new data structure
  if (data.username && data.pinnedRepos) {
    const username = data.username as string;
    const profileUrl = data.profileUrl as string;
    const totalContributions = data.totalContributions as number;
    const pinnedRepos = data.pinnedRepos as Array<{
      name: string;
      description?: string;
      url: string;
      stars: number;
    }>;

    if (!username || !pinnedRepos.length) {
      return MESSAGES.github.noProfile;
    }

    let formatted = `In the last year I've had about 📦 **${totalContributions.toLocaleString()}** contributions on [**GitHub**](${profileUrl})\n\n`;
    formatted += "## Here's some of my pinned repos:\n\n";

    const repoList = pinnedRepos
      .map((repo) => {
        const description = repo.description ? `\n  ${repo.description}` : '';
        const stars = repo.stars > 0 ? ` ⭐ ${repo.stars}` : '';
        return `- **[${repo.name}](${repo.url})**${stars}${description}`;
      })
      .join('\n');

    formatted += repoList;

    return formatted;
  }

  // Fallback to old structure for backward compatibility
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

  // Check if we have a single blog post
  if (data.title && data.link) {
    const title = data.title as string;
    const link = data.link as string;
    const publishedAt = data.publishedAt as string;

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

    return `My latest blog post **${timeAgo}** ✍️ was: [${title}](${link})`;
  }

  // No blog posts available
  return MESSAGES.blog.noPosts;
}

/**
 * Formats raw project data into structured format
 */
export function formatProjectData(projectData: Record<string, unknown>): {
  data: Record<string, unknown>;
  formatted: string;
} {
  return {
    data: projectData,
    formatted:
      (Array.isArray(projectData.content) && projectData.content[0]?.text) ||
      'Project information not available.',
  };
}
