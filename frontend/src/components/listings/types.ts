export interface Listing {
  id: string;
  landlordId: string;
  platformId?: string;
  title: string;
  description: string;
  type: 'residential' | 'commercial' | 'bnb';
  price: number;
  location: string;
  images: string[];
  status: 'available' | 'rented' | 'booked';
  amenities: string[];
  createdAt?: string;
}

export const TYPE_LABELS: Record<Listing['type'], string> = {
  residential: 'Home',
  commercial: 'Commercial',
  bnb: 'Short stay',
};

export const formatKes = (amount: number) => `KES ${Number(amount).toLocaleString('en-KE')}`;

export const priceUnit = (type: Listing['type']) => (type === 'bnb' ? 'night' : 'month');
