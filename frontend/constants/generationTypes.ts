export const GENERATION_TYPES = [
  'catalog',
  'catalog-on-wallpaper',
  'wallpaper',
  'announcement',
  'job-post',
  'promotion',
] as const;

export type GenerationType = (typeof GENERATION_TYPES)[number];

export const GENERATION_TYPE_LABELS: Record<GenerationType, string> = {
  catalog: 'Catalog',
  'catalog-on-wallpaper': 'Catalog on Wallpaper',
  wallpaper: 'Wallpaper',
  announcement: 'Announcement',
  'job-post': 'Job Post',
  promotion: 'Promotion',
};

export const GENERATION_TYPE_I18N_KEYS: Record<
  GenerationType,
  | 'genType.catalog'
  | 'genType.catalogOnWallpaper'
  | 'genType.wallpaper'
  | 'genType.announcement'
  | 'genType.jobPost'
  | 'genType.promotion'
> = {
  catalog: 'genType.catalog',
  'catalog-on-wallpaper': 'genType.catalogOnWallpaper',
  wallpaper: 'genType.wallpaper',
  announcement: 'genType.announcement',
  'job-post': 'genType.jobPost',
  promotion: 'genType.promotion',
};
