import { KUDAGO_CITIES } from '../events/event-filters';

export const REGISTER_CITY_OPTIONS = KUDAGO_CITIES.map(city => ({
  slug: city.slug,
  name: city.name,
}));

export interface RegisterStep1FormValues {
  email: string;
  username: string;
  password: string;
  city: string;
}

export function validateRegisterStep1(values: RegisterStep1FormValues): string | null {
  if (!values.email.trim() || !values.username.trim() || !values.password.trim()) {
    return 'Заполните все обязательные поля';
  }
  if (!values.city.trim()) {
    return 'Выберите город';
  }
  return null;
}
