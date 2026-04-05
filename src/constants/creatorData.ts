/**
 * Centralized creator type and genre definitions.
 *
 * To add a new type or genre, add a single entry to the relevant array.
 * No component logic changes needed (Open/Closed Principle).
 */

// ── Categories ──

export type CreatorCategory = 'music' | 'visual_art' | 'literary' | 'performing' | 'meta';

// ── Creator Types ──

export interface CreatorTypeDefinition {
  id: string;
  labelKey: string;
  category: CreatorCategory;
  iconName: string;
}

export const CREATOR_TYPES: CreatorTypeDefinition[] = [
  // Music
  { id: 'singer', labelKey: 'creatorTypes.types.singer', category: 'music', iconName: 'mic' },
  { id: 'songwriter', labelKey: 'creatorTypes.types.songwriter', category: 'music', iconName: 'musical-notes' },
  { id: 'rapper', labelKey: 'creatorTypes.types.rapper', category: 'music', iconName: 'megaphone' },
  { id: 'producer', labelKey: 'creatorTypes.types.producer', category: 'music', iconName: 'headset' },
  // Visual Art
  { id: 'painter', labelKey: 'creatorTypes.types.painter', category: 'visual_art', iconName: 'color-palette' },
  { id: 'sculptor', labelKey: 'creatorTypes.types.sculptor', category: 'visual_art', iconName: 'cube' },
  { id: 'photographer', labelKey: 'creatorTypes.types.photographer', category: 'visual_art', iconName: 'camera' },
  // Literary
  { id: 'poet', labelKey: 'creatorTypes.types.poet', category: 'literary', iconName: 'book' },
  { id: 'writer', labelKey: 'creatorTypes.types.writer', category: 'literary', iconName: 'create' },
  // Performing
  { id: 'actor', labelKey: 'creatorTypes.types.actor', category: 'performing', iconName: 'film' },
  { id: 'dancer', labelKey: 'creatorTypes.types.dancer', category: 'performing', iconName: 'body' },
  // Meta
  { id: 'multifaceted', labelKey: 'creatorTypes.types.multifaceted', category: 'meta', iconName: 'sparkles' },
  { id: 'other', labelKey: 'creatorTypes.types.other', category: 'meta', iconName: 'ellipsis-horizontal' },
];

// ── Genres ──

export interface GenreDefinition {
  id: string;
  labelKey: string;
}

export const GENRE_MAP: Record<Exclude<CreatorCategory, 'meta'>, GenreDefinition[]> = {
  music: [
    { id: 'hip_hop', labelKey: 'creatorGenres.genres.hip_hop' },
    { id: 'rnb', labelKey: 'creatorGenres.genres.rnb' },
    { id: 'rap', labelKey: 'creatorGenres.genres.rap' },
    { id: 'rock', labelKey: 'creatorGenres.genres.rock' },
    { id: 'pop', labelKey: 'creatorGenres.genres.pop' },
    { id: 'jazz', labelKey: 'creatorGenres.genres.jazz' },
    { id: 'blues', labelKey: 'creatorGenres.genres.blues' },
    { id: 'country', labelKey: 'creatorGenres.genres.country' },
    { id: 'electronic', labelKey: 'creatorGenres.genres.electronic' },
    { id: 'latin', labelKey: 'creatorGenres.genres.latin' },
    { id: 'classical', labelKey: 'creatorGenres.genres.classical' },
    { id: 'gospel', labelKey: 'creatorGenres.genres.gospel' },
    { id: 'reggae', labelKey: 'creatorGenres.genres.reggae' },
    { id: 'metal', labelKey: 'creatorGenres.genres.metal' },
    { id: 'folk', labelKey: 'creatorGenres.genres.folk' },
    { id: 'punk', labelKey: 'creatorGenres.genres.punk' },
    { id: 'soul', labelKey: 'creatorGenres.genres.soul' },
    { id: 'funk', labelKey: 'creatorGenres.genres.funk' },
    { id: 'alternative', labelKey: 'creatorGenres.genres.alternative' },
    { id: 'indie', labelKey: 'creatorGenres.genres.indie' },
    { id: 'reggaeton', labelKey: 'creatorGenres.genres.reggaeton' },
    { id: 'trap', labelKey: 'creatorGenres.genres.trap' },
  ],
  visual_art: [
    { id: 'contemporary', labelKey: 'creatorGenres.genres.contemporary' },
    { id: 'modern', labelKey: 'creatorGenres.genres.modern' },
    { id: 'abstract', labelKey: 'creatorGenres.genres.abstract' },
    { id: 'impressionist', labelKey: 'creatorGenres.genres.impressionist' },
    { id: 'expressionist', labelKey: 'creatorGenres.genres.expressionist' },
    { id: 'minimalist', labelKey: 'creatorGenres.genres.minimalist' },
    { id: 'pop_art', labelKey: 'creatorGenres.genres.pop_art' },
    { id: 'street_art', labelKey: 'creatorGenres.genres.street_art' },
    { id: 'realism', labelKey: 'creatorGenres.genres.realism' },
    { id: 'surrealism', labelKey: 'creatorGenres.genres.surrealism' },
  ],
  literary: [
    { id: 'poetry', labelKey: 'creatorGenres.genres.poetry' },
    { id: 'fiction', labelKey: 'creatorGenres.genres.fiction' },
    { id: 'non_fiction', labelKey: 'creatorGenres.genres.non_fiction' },
    { id: 'spoken_word', labelKey: 'creatorGenres.genres.spoken_word' },
    { id: 'lyrics', labelKey: 'creatorGenres.genres.lyrics' },
    { id: 'essays', labelKey: 'creatorGenres.genres.essays' },
  ],
  performing: [
    { id: 'theater', labelKey: 'creatorGenres.genres.theater' },
    { id: 'film', labelKey: 'creatorGenres.genres.film' },
    { id: 'contemporary_dance', labelKey: 'creatorGenres.genres.contemporary_dance' },
    { id: 'ballet', labelKey: 'creatorGenres.genres.ballet' },
    { id: 'hip_hop_dance', labelKey: 'creatorGenres.genres.hip_hop_dance' },
    { id: 'improv', labelKey: 'creatorGenres.genres.improv' },
  ],
};

// ── Grouped genres utility ──

export interface GroupedGenres {
  category: CreatorCategory;
  categoryLabelKey: string;
  genres: GenreDefinition[];
}

const CATEGORY_LABELS: Record<Exclude<CreatorCategory, 'meta'>, string> = {
  music: 'creatorGenres.categories.music',
  visual_art: 'creatorGenres.categories.visual_art',
  literary: 'creatorGenres.categories.literary',
  performing: 'creatorGenres.categories.performing',
};

/**
 * Returns genre groups relevant to the selected creator types.
 * "meta" types (multifaceted, other) don't contribute genres.
 */
export function getGenresForSelectedTypes(selectedTypeIds: string[]): GroupedGenres[] {
  const categories = new Set<Exclude<CreatorCategory, 'meta'>>();

  for (const typeId of selectedTypeIds) {
    const def = CREATOR_TYPES.find((t) => t.id === typeId);
    if (def && def.category !== 'meta') {
      categories.add(def.category as Exclude<CreatorCategory, 'meta'>);
    }
  }

  return Array.from(categories)
    .map((cat) => ({
      category: cat as CreatorCategory,
      categoryLabelKey: CATEGORY_LABELS[cat],
      genres: GENRE_MAP[cat] ?? [],
    }))
    .filter((g) => g.genres.length > 0);
}

/**
 * Returns a Set of all valid genre IDs for the given creator types.
 * Used to clean up orphaned genre selections when types change.
 */
export function getValidGenreIds(selectedTypeIds: string[]): Set<string> {
  return new Set(
    getGenresForSelectedTypes(selectedTypeIds).flatMap((g) => g.genres.map((genre) => genre.id))
  );
}
