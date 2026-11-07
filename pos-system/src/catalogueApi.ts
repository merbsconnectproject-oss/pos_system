import { request } from './apiClient';

/**
 * Catalogue setup — FR-PROD-05, FR-UOM-01.
 *
 * The categories, brands and units every product form picks from. These were
 * hard-coded arrays in `ProductsView` and a local `useState`, so every add,
 * rename and retire died on refresh.
 */
export type CatalogueList = 'categories' | 'brands' | 'units';

export interface CatalogueListItem {
  id: string;
  name: string;
  active: boolean;
  /** How many products use it — what lets the screen explain a refusal to retire. */
  inUse: number;
}

export const catalogueApi = {
  list: (list: CatalogueList, includeInactive = false) =>
    request<CatalogueListItem[]>(`/api/catalogue/${list}?includeInactive=${includeInactive}`),

  add: (list: CatalogueList, name: string) =>
    request<CatalogueListItem>(`/api/catalogue/${list}`, {
      method: 'POST', body: JSON.stringify({ name }),
    }),

  rename: (list: CatalogueList, id: string, name: string) =>
    request<CatalogueListItem>(`/api/catalogue/${list}/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify({ name }),
    }),

  /** BR-17: retired, not deleted. Refused with a count if products still use it. */
  setActive: (list: CatalogueList, id: string, active: boolean) =>
    request<CatalogueListItem>(`/api/catalogue/${list}/${encodeURIComponent(id)}/active?value=${active}`, {
      method: 'POST',
    }),
};

/** All three lists at once, for a screen that shows them side by side. */
export const loadCatalogueLists = () =>
  Promise.all([
    catalogueApi.list('categories'),
    catalogueApi.list('brands'),
    catalogueApi.list('units'),
  ]).then(([categories, brands, units]) => ({ categories, brands, units }));
