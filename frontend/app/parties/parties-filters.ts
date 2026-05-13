export const POPULAR_PARTY_CITIES = [
  'msk',
  'spb',
  'kzn',
  'ekb',
  'nn',
] as const;

export const CITY_CODE_TO_NAME: Record<string, string> = {
  'msk': 'Москва',
  'spb': 'Санкт-Петербург',
  'kzn': 'Казань',
  'ekb': 'Екатеринбург',
  'nn': 'Нижний Новгород',
};

export type PartySortMode = 'new' | 'popular' | 'date';

export interface PartyFilterQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  cities?: string[];
  dateFrom?: string;
  dateTo?: string;
  minMembers?: string;
  maxMembers?: string;
  sortBy?: PartySortMode;
  onlyOpen?: boolean;
}

export function togglePartyCity(selected: string[], city: string): string[] {
  return selected.includes(city)
    ? selected.filter(item => item !== city)
    : [...selected, city];
}

export function buildPartiesSearchQuery({
  page = 1,
  pageSize = 20,
  search = '',
  cities = [],
  dateFrom = '',
  dateTo = '',
  minMembers = '',
  maxMembers = '',
  sortBy = 'new',
  onlyOpen = false,
}: PartyFilterQuery): string {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(pageSize),
    sort_by: sortBy,
  });

  if (search.trim()) params.set('q', search.trim());
  cities.map(city => city.trim()).filter(Boolean).forEach(city => params.append('city', city));
  if (dateFrom) params.set('date_from', `${dateFrom}T00:00:00`);
  if (dateTo) params.set('date_to', `${dateTo}T23:59:59`);
  if (minMembers) params.set('min_members', minMembers);
  if (maxMembers) params.set('max_members', maxMembers);
  if (onlyOpen) params.set('is_open', 'true');

  return params.toString();
}

export function buildPartiesUrlQuery({
  search = '',
  cities = [],
  dateFrom = '',
  dateTo = '',
  minMembers = '',
  maxMembers = '',
  sortBy = 'new',
  onlyOpen = false,
}: PartyFilterQuery): string {
  const params = new URLSearchParams();
  if (search.trim()) params.set('q', search.trim());
  cities.map(city => city.trim()).filter(Boolean).forEach(city => params.append('city', city));
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  if (minMembers) params.set('min_members', minMembers);
  if (maxMembers) params.set('max_members', maxMembers);
  if (sortBy !== 'new') params.set('sort_by', sortBy);
  if (onlyOpen) params.set('only_open', 'true');
  return params.toString();
}

export function countActivePartyFilters({
  search = '',
  cities = [],
  dateFrom = '',
  dateTo = '',
  minMembers = '',
  maxMembers = '',
  sortBy = 'new',
  onlyOpen = false,
}: PartyFilterQuery): number {
  return [
    search.trim(),
    cities.length > 0,
    dateFrom,
    dateTo,
    minMembers,
    maxMembers,
    sortBy !== 'new',
    onlyOpen,
  ].filter(Boolean).length;
}
