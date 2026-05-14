import { useState, useCallback, useRef, useEffect } from 'react';

const DADATA_API_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
const DEBOUNCE_MS = 300;
const RESULTS_COUNT = 7;

export interface CityOption {
  value: string;
  city: string;
  region?: string;
}

interface DaDataSuggestion {
  value: string;
  data: {
    city: string | null;
    region?: string;
    region_type_full?: string;
  };
}

interface UseCityAutocompleteReturn {
  query: string;
  setQuery: (value: string) => void;
  suggestions: CityOption[];
  loading: boolean;
  error: string | null;
  selectedCity: CityOption | null;
  setSelectedCity: (city: CityOption | null) => void;
  clear: () => void;
}

export function useCityAutocomplete(): UseCityAutocompleteReturn {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityOption | null>(null);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const apiKey = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_DADATA_API_KEY : '';

  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (!apiKey) {
      setError('API ключ не настроен');
      return;
    }

    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(DADATA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${apiKey}`,
        },
        body: JSON.stringify({
          query: searchQuery,
          from_bound: { value: 'city' },
          to_bound: { value: 'city' },
          count: RESULTS_COUNT,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ошибка API: ${response.status}`);
      }

      const data = await response.json();
      const cities: CityOption[] = (data.suggestions || [])
        .filter((s: DaDataSuggestion) => s.data.city)
        .map((s: DaDataSuggestion) => ({
          value: s.value,
          city: s.data.city!,
          region: s.data.region,
        }));

      setSuggestions(cities);
    } catch (err) {
      console.error('DaData API error:', err);
      setError('Не удалось загрузить города');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.length >= 2) {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(value);
      }, DEBOUNCE_MS);
    } else {
      setSuggestions([]);
    }

    // Не сбрасываем selectedCity автоматически - выбор должен быть явным действием пользователя
  }, [fetchSuggestions]);

  const clear = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setSelectedCity(null);
    setError(null);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    query,
    setQuery: handleQueryChange,
    suggestions,
    loading,
    error,
    selectedCity,
    setSelectedCity: (city) => {
      setSelectedCity(city);
      if (city) {
        setQuery(city.value);
        setSuggestions([]);
      }
    },
    clear,
  };
}
