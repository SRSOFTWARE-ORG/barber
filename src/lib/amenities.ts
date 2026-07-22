import {
  Snowflake, Wifi, Tv, Gamepad2, Gamepad, Beer, Coffee, UtensilsCrossed,
  Car, Home, Accessibility, Baby, Music, Target, Droplets, ParkingCircle,
  type LucideIcon,
} from 'lucide-react';

export interface Amenity {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Catálogo de comodidades/diferenciais que a barbearia pode oferecer.
 * Os ids são persistidos em profiles.comodidades (text[]).
 */
export const AMENITIES: Amenity[] = [
  { id: 'ar_condicionado', label: 'Ar Condicionado', icon: Snowflake },
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { id: 'tv', label: 'TV', icon: Tv },
  { id: 'sinuca', label: 'Sinuca', icon: Target },
  { id: 'playstation', label: 'PlayStation', icon: Gamepad2 },
  { id: 'xbox', label: 'Xbox', icon: Gamepad },
  { id: 'bebidas', label: 'Bebidas', icon: Beer },
  { id: 'cafe', label: 'Café', icon: Coffee },
  { id: 'lanchonete', label: 'Lanchonete', icon: UtensilsCrossed },
  { id: 'estacionamento', label: 'Estacionamento', icon: ParkingCircle },
  { id: 'domicilio', label: 'Atende em domicílio', icon: Home },
  { id: 'acessibilidade', label: 'Acessível', icon: Accessibility },
  { id: 'kids', label: 'Espaço Kids', icon: Baby },
  { id: 'som', label: 'Som ambiente', icon: Music },
  { id: 'lavatorio', label: 'Lavatório', icon: Droplets },
  { id: 'transporte', label: 'Leva e traz', icon: Car },
];

export const AMENITIES_MAP: Record<string, Amenity> = Object.fromEntries(
  AMENITIES.map((a) => [a.id, a]),
);
