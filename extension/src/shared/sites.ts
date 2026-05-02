import type { BlockedSite, SiteId } from './types';

export const SITES: BlockedSite[] = [
  {
    id: 'reddit',
    label: 'Reddit',
    host: 'reddit.com',
    domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com'],
    ruleBaseId: 1100
  },
  {
    id: 'youtube',
    label: 'YouTube',
    host: 'youtube.com',
    domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'],
    ruleBaseId: 1200
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    host: 'tiktok.com',
    domains: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
    ruleBaseId: 1300
  },
  {
    id: 'instagram',
    label: 'Instagram',
    host: 'instagram.com',
    domains: ['instagram.com', 'www.instagram.com'],
    ruleBaseId: 1400
  }
];

export const DEFAULT_ENABLED_SITE_IDS = SITES.map(site => site.id);

export function getSite(siteId: SiteId | string | null | undefined) {
  return SITES.find(site => site.id === siteId) ?? SITES[0]!;
}

export function getSiteHomeUrl(siteId: SiteId) {
  const site = getSite(siteId);
  return `https://${site.host}/`;
}

export function getAllRuleIds() {
  return SITES.flatMap(site => site.domains.map((_, index) => site.ruleBaseId + index));
}
