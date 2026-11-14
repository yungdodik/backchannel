// News URLs read by hand during A8 and found to be about a namesake or not news; never shown as a fact (D6).
export const NEWS_BLOCKLIST = new Set([
  "https://abc13.com/post/2-alvin-isd-elementary-schools-shut-down-early-summer-following-storm-damage/19139599/", // Alvin ISD schools, not Alvin (data lineage)
  "https://www.linkedin.com/posts/alvinbahadur_adp-dayforce-ceridian-activity-7427796235094425602-rLHX", // a person named Alvin laid off at Dayforce
  "https://www.bizjournals.com/washington/news/2025/07/15/joy-custom-design-build-bankruptcy-virginia.html", // Joy Custom Design Build, not Joy (life events)
  "https://agentunfolded.com/ai-agents-that-failed/", // generic tracker of AI agents, not the company "AI Agents"
  "https://checkpointgaming.net/news/2024/10/hi-rez-studios-announces-shutdown-of-realm-royale-refoged-and-divine-knockout/", // Realm Royale game
  "https://www.gamenguide.com/articles/106471/20241022/realm-royale-reforged-divine-knockout-servers-to-be-shut-down-hi-rez-studios-announces.htm", // Realm Royale game
  "https://ehandel.com/blue-billie-opens-new-physical-store-in-mood-stockholm-after-bankruptcy/", // Blue Billie (consumer brand), not Billie (B2B payments)
  "https://eustartups.news/swedish-consumer-brand-blue-billie-rescued-from-bankruptcy-with-new-leadership/", // Blue Billie
  "https://www.prnewswire.com/news-releases/third-and-grove-acquires-elva-a-shopify-platinum-partner-302572417.html", // Elva the Shopify agency, not Elva (relocation)
  "https://www.linkedin.com/posts/elva-group_aws-amazonwebservices-cloud-activity-7492903962367451136-GTau", // Elva Group / Elva11
  "https://www.linkedin.com/posts/sebastianbille_work-at-elva-elva-activity-7137725321851641856-L9kd", // a hiring post mentioning layoffs elsewhere
  "https://www.linkedin.com/posts/ronen-givon-535b2514_rekki-shut-down-for-a-day-last-week-i-stopped-activity-7421972449145229312-RSua", // "shut down for a day", not a shutdown
  "https://www.khou.com/video/news/local/two-alvin-isd-elementary-schools-shut-down-wednesday-due-to-storm-damage/285-e3f641d9-9b5a-426e-af62-a876e231195a", // Alvin ISD schools again
  "https://scienceguru.blog/did-pg-acquire-billie-acquisition-status", // Billie the razor brand (and the deal was blocked), not Billie (B2B payments)
]);
