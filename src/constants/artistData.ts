/**
 * Centralized artist type and genre definitions.
 *
 * To add a new type or genre, add a single entry to the relevant array.
 * No component logic changes needed (Open/Closed Principle).
 */

// ── Categories ──

export type ArtistCategory = 'music' | 'visual_art' | 'literary' | 'performing' | 'meta';

// ── Artist Types ──

export interface ArtistTypeDefinition {
  id: string;
  labelKey: string;
  category: ArtistCategory;
  iconName: string;
}

export const ARTIST_TYPES: ArtistTypeDefinition[] = [
  // Music
  { id: 'singer', labelKey: 'artistTypes.types.singer', category: 'music', iconName: 'mic' },
  { id: 'songwriter', labelKey: 'artistTypes.types.songwriter', category: 'music', iconName: 'musical-notes' },
  { id: 'rapper', labelKey: 'artistTypes.types.rapper', category: 'music', iconName: 'megaphone' },
  { id: 'producer', labelKey: 'artistTypes.types.producer', category: 'music', iconName: 'headset' },
  // Visual Art
  { id: 'painter', labelKey: 'artistTypes.types.painter', category: 'visual_art', iconName: 'color-palette' },
  { id: 'sculptor', labelKey: 'artistTypes.types.sculptor', category: 'visual_art', iconName: 'cube' },
  { id: 'photographer', labelKey: 'artistTypes.types.photographer', category: 'visual_art', iconName: 'camera' },
  // Literary
  { id: 'poet', labelKey: 'artistTypes.types.poet', category: 'literary', iconName: 'book' },
  { id: 'writer', labelKey: 'artistTypes.types.writer', category: 'literary', iconName: 'create' },
  // Performing
  { id: 'actor', labelKey: 'artistTypes.types.actor', category: 'performing', iconName: 'film' },
  { id: 'dancer', labelKey: 'artistTypes.types.dancer', category: 'performing', iconName: 'body' },
  // Meta
  { id: 'multifaceted', labelKey: 'artistTypes.types.multifaceted', category: 'meta', iconName: 'sparkles' },
  { id: 'other', labelKey: 'artistTypes.types.other', category: 'meta', iconName: 'ellipsis-horizontal' },
];

// ── Genres ──

export interface GenreDefinition {
  id: string;
  labelKey: string;
}

export const GENRE_MAP: Record<Exclude<ArtistCategory, 'meta'>, GenreDefinition[]> = {
  music: [
    { id: 'hip_hop', labelKey: 'artistGenres.genres.hip_hop' },
    { id: 'rnb', labelKey: 'artistGenres.genres.rnb' },
    { id: 'rap', labelKey: 'artistGenres.genres.rap' },
    { id: 'rock', labelKey: 'artistGenres.genres.rock' },
    { id: 'pop', labelKey: 'artistGenres.genres.pop' },
    { id: 'jazz', labelKey: 'artistGenres.genres.jazz' },
    { id: 'blues', labelKey: 'artistGenres.genres.blues' },
    { id: 'country', labelKey: 'artistGenres.genres.country' },
    { id: 'electronic', labelKey: 'artistGenres.genres.electronic' },
    { id: 'latin', labelKey: 'artistGenres.genres.latin' },
    { id: 'classical', labelKey: 'artistGenres.genres.classical' },
    { id: 'gospel', labelKey: 'artistGenres.genres.gospel' },
    { id: 'reggae', labelKey: 'artistGenres.genres.reggae' },
    { id: 'metal', labelKey: 'artistGenres.genres.metal' },
    { id: 'folk', labelKey: 'artistGenres.genres.folk' },
    { id: 'punk', labelKey: 'artistGenres.genres.punk' },
    { id: 'soul', labelKey: 'artistGenres.genres.soul' },
    { id: 'funk', labelKey: 'artistGenres.genres.funk' },
    { id: 'alternative', labelKey: 'artistGenres.genres.alternative' },
    { id: 'indie', labelKey: 'artistGenres.genres.indie' },
    { id: 'reggaeton', labelKey: 'artistGenres.genres.reggaeton' },
    { id: 'trap', labelKey: 'artistGenres.genres.trap' },
  ],
  visual_art: [
    { id: 'contemporary', labelKey: 'artistGenres.genres.contemporary' },
    { id: 'modern', labelKey: 'artistGenres.genres.modern' },
    { id: 'abstract', labelKey: 'artistGenres.genres.abstract' },
    { id: 'impressionist', labelKey: 'artistGenres.genres.impressionist' },
    { id: 'expressionist', labelKey: 'artistGenres.genres.expressionist' },
    { id: 'minimalist', labelKey: 'artistGenres.genres.minimalist' },
    { id: 'pop_art', labelKey: 'artistGenres.genres.pop_art' },
    { id: 'street_art', labelKey: 'artistGenres.genres.street_art' },
    { id: 'realism', labelKey: 'artistGenres.genres.realism' },
    { id: 'surrealism', labelKey: 'artistGenres.genres.surrealism' },
  ],
  literary: [
    { id: 'poetry', labelKey: 'artistGenres.genres.poetry' },
    { id: 'fiction', labelKey: 'artistGenres.genres.fiction' },
    { id: 'non_fiction', labelKey: 'artistGenres.genres.non_fiction' },
    { id: 'spoken_word', labelKey: 'artistGenres.genres.spoken_word' },
    { id: 'lyrics', labelKey: 'artistGenres.genres.lyrics' },
    { id: 'essays', labelKey: 'artistGenres.genres.essays' },
  ],
  performing: [
    { id: 'theater', labelKey: 'artistGenres.genres.theater' },
    { id: 'film', labelKey: 'artistGenres.genres.film' },
    { id: 'contemporary_dance', labelKey: 'artistGenres.genres.contemporary_dance' },
    { id: 'ballet', labelKey: 'artistGenres.genres.ballet' },
    { id: 'hip_hop_dance', labelKey: 'artistGenres.genres.hip_hop_dance' },
    { id: 'improv', labelKey: 'artistGenres.genres.improv' },
  ],
};

// ── Grouped genres utility ──

export interface GroupedGenres {
  category: ArtistCategory;
  categoryLabelKey: string;
  genres: GenreDefinition[];
}

const CATEGORY_LABELS: Record<Exclude<ArtistCategory, 'meta'>, string> = {
  music: 'artistGenres.categories.music',
  visual_art: 'artistGenres.categories.visual_art',
  literary: 'artistGenres.categories.literary',
  performing: 'artistGenres.categories.performing',
};

/**
 * Returns genre groups relevant to the selected artist types.
 * "meta" types (multifaceted, other) don't contribute genres.
 */
export function getGenresForSelectedTypes(selectedTypeIds: string[]): GroupedGenres[] {
  const categories = new Set<Exclude<ArtistCategory, 'meta'>>();

  for (const typeId of selectedTypeIds) {
    const def = ARTIST_TYPES.find((t) => t.id === typeId);
    if (def && def.category !== 'meta') {
      categories.add(def.category as Exclude<ArtistCategory, 'meta'>);
    }
  }

  return Array.from(categories)
    .map((cat) => ({
      category: cat as ArtistCategory,
      categoryLabelKey: CATEGORY_LABELS[cat],
      genres: GENRE_MAP[cat] ?? [],
    }))
    .filter((g) => g.genres.length > 0);
}

/**
 * Returns a Set of all valid genre IDs for the given artist types.
 * Used to clean up orphaned genre selections when types change.
 */
export function getValidGenreIds(selectedTypeIds: string[]): Set<string> {
  return new Set(
    getGenresForSelectedTypes(selectedTypeIds).flatMap((g) => g.genres.map((genre) => genre.id))
  );
}
