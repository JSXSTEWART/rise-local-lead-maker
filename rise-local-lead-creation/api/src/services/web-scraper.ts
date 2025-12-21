import axios from 'axios';
import { Lead } from '../types/lead';

export interface WebScraperConfig {
  userAgent?: string;
  timeout?: number;
  followRedirects?: boolean;
}

export interface ScrapedContact {
  emails: string[];
  phones: string[];
  socialLinks: Record<string, string>;
  companyName?: string;
  address?: string;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Email regex pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Phone regex patterns (various formats)
const PHONE_PATTERNS = [
  /\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g, // US/CA format
  /\+?[0-9]{1,4}[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/g, // International
];

// Social media patterns
const SOCIAL_PATTERNS: Record<string, RegExp> = {
  linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]+\/?/gi,
  twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/?/gi,
  facebook: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?/gi,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?/gi,
  youtube: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c\/|channel\/|@)[a-zA-Z0-9_-]+\/?/gi,
};

export async function fetchWebpage(
  url: string,
  config: WebScraperConfig = {}
): Promise<string> {
  const { userAgent = DEFAULT_USER_AGENT, timeout = 10000 } = config;

  // Ensure URL has protocol
  const fullUrl = url.startsWith('http') ? url : `https://${url}`;

  try {
    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout,
      maxRedirects: 5,
    });

    return response.data;
  } catch (error: any) {
    console.error(`[WebScraper] Failed to fetch ${fullUrl}:`, error.message);
    throw new Error(`Failed to fetch webpage: ${error.message}`);
  }
}

export function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) || [];

  // Filter out common false positives
  const filtered = matches.filter((email) => {
    const lower = email.toLowerCase();
    return (
      !lower.includes('example.com') &&
      !lower.includes('sentry.io') &&
      !lower.includes('wixpress.com') &&
      !lower.includes('.png') &&
      !lower.includes('.jpg') &&
      !lower.includes('.gif') &&
      !lower.endsWith('.js') &&
      !lower.endsWith('.css')
    );
  });

  // Remove duplicates and return unique emails
  return [...new Set(filtered)];
}

export function extractPhones(html: string): string[] {
  const phones: string[] = [];

  for (const pattern of PHONE_PATTERNS) {
    const matches = html.match(pattern) || [];
    phones.push(...matches);
  }

  // Clean and deduplicate
  const cleaned = phones
    .map((phone) => phone.replace(/[^\d+]/g, ''))
    .filter((phone) => phone.length >= 10 && phone.length <= 15);

  return [...new Set(cleaned)];
}

export function extractSocialLinks(html: string): Record<string, string> {
  const socialLinks: Record<string, string> = {};

  for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      // Take the first match, clean it up
      let link = matches[0];
      if (!link.startsWith('http')) {
        link = 'https://' + link;
      }
      socialLinks[platform] = link.replace(/\/$/, ''); // Remove trailing slash
    }
  }

  return socialLinks;
}

export function extractCompanyName(html: string, domain: string): string | undefined {
  // Try to extract from title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1]
      .split(/[|\-–—]/)[0]
      .trim()
      .replace(/\s*(Home|Homepage|Welcome)\s*/gi, '')
      .trim();
    if (title.length > 2 && title.length < 100) {
      return title;
    }
  }

  // Try to extract from og:site_name
  const ogSiteMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (ogSiteMatch) {
    return ogSiteMatch[1].trim();
  }

  // Fallback to domain name
  const domainName = domain
    .replace(/^www\./, '')
    .split('.')[0]
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return domainName;
}

export function extractAddress(html: string): string | undefined {
  // Look for structured data
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      try {
        const content = match.replace(/<script[^>]*>|<\/script>/gi, '');
        const data = JSON.parse(content);

        if (data.address) {
          if (typeof data.address === 'string') return data.address;
          if (data.address.streetAddress) {
            return [
              data.address.streetAddress,
              data.address.addressLocality,
              data.address.addressRegion,
              data.address.postalCode,
            ]
              .filter(Boolean)
              .join(', ');
          }
        }
      } catch {
        // JSON parse failed, continue
      }
    }
  }

  // Look for common address patterns in text
  const addressPattern = /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)[,.\s]+[\w\s]+,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?/gi;
  const addressMatch = html.match(addressPattern);

  if (addressMatch && addressMatch.length > 0) {
    return addressMatch[0].replace(/\s+/g, ' ').trim();
  }

  return undefined;
}

export async function scrapeWebsite(url: string): Promise<ScrapedContact> {
  const html = await fetchWebpage(url);
  const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;

  // Also try to fetch contact page
  let contactHtml = '';
  try {
    const contactUrls = ['/contact', '/contact-us', '/about', '/about-us'];
    for (const path of contactUrls) {
      try {
        const baseUrl = url.startsWith('http') ? url : `https://${url}`;
        const contactUrl = new URL(path, baseUrl).toString();
        contactHtml += await fetchWebpage(contactUrl);
        break; // Stop after first successful fetch
      } catch {
        // Continue to next URL
      }
    }
  } catch {
    // Ignore contact page errors
  }

  const combinedHtml = html + contactHtml;

  return {
    emails: extractEmails(combinedHtml),
    phones: extractPhones(combinedHtml),
    socialLinks: extractSocialLinks(combinedHtml),
    companyName: extractCompanyName(html, domain),
    address: extractAddress(combinedHtml),
  };
}

export async function scrapeWebsitesToLeads(websites: string[]): Promise<Lead[]> {
  const leads: Lead[] = [];

  for (const website of websites) {
    try {
      console.log(`[WebScraper] Scraping: ${website}`);
      const scraped = await scrapeWebsite(website);

      const lead: Lead = {
        company: scraped.companyName,
        email: scraped.emails[0],
        phone: scraped.phones[0],
        website: website.startsWith('http') ? website : `https://${website}`,
        location: scraped.address,
        linkedinUrl: scraped.socialLinks.linkedin,
        source: 'web_scraper',
        status: 'new',
        metadata: {
          allEmails: scraped.emails,
          allPhones: scraped.phones,
          socialLinks: scraped.socialLinks,
          scrapedAt: new Date().toISOString(),
        },
      };

      leads.push(lead);

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(`[WebScraper] Error scraping ${website}:`, error.message);
      leads.push({
        website: website.startsWith('http') ? website : `https://${website}`,
        source: 'web_scraper',
        status: 'failed',
        metadata: {
          error: error.message,
          scrapedAt: new Date().toISOString(),
        },
      });
    }
  }

  return leads;
}

export const webScraper = {
  fetchWebpage,
  scrapeWebsite,
  scrapeWebsitesToLeads,
  extractEmails,
  extractPhones,
  extractSocialLinks,
};
