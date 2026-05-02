import { describe, expect, it } from 'vitest';
import { KUDAGO_CITIES } from '../events/event-filters';
import { REGISTER_CITY_OPTIONS, validateRegisterStep1 } from './register-city';

describe('REGISTER_CITY_OPTIONS', () => {
  it('reuses KUDAGO_CITIES and preserves order', () => {
    expect(REGISTER_CITY_OPTIONS).toEqual(
      KUDAGO_CITIES.map(city => ({ slug: city.slug, name: city.name })),
    );
  });
});

describe('validateRegisterStep1', () => {
  it('requires city selection', () => {
    expect(validateRegisterStep1({
      email: 'user@example.com',
      username: 'user',
      password: 'password123',
      city: '',
    })).toBe('Выберите город');
  });

  it('accepts valid step-1 data', () => {
    expect(validateRegisterStep1({
      email: 'user@example.com',
      username: 'user',
      password: 'password123',
      city: 'Казань',
    })).toBeNull();
  });

  it('keeps existing message for missing required identity fields', () => {
    expect(validateRegisterStep1({
      email: '',
      username: 'user',
      password: 'password123',
      city: 'Москва',
    })).toBe('Заполните все обязательные поля');
  });
});
