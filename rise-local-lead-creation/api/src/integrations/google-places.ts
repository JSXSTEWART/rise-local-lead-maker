import axios from 'axios';
import { env } from '../config/env';
import { Lead } from '../types/lead';

// New Places API (v1) base URL
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export interface PlaceSearchParams {
  query: string;
  location?: string; // "lat,lng" format
  radius?: number; // meters, max 50000
  type?: string; // business type (restaurant, dentist, etc.)
  minRating?: number;
}

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  types?: string[];
  location: {
    lat: number;
    lng: number;
  };
  businessStatus?: string;
  openNow?: boolean;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  formattedPhone?: string;
  internationalPhone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  types?: string[];
  openingHours?: string[];
  priceLevel?: number;
  url?: string; // Google Maps URL
  vicinity?: string;
}

async function textSearch(params: PlaceSearchParams): Promise<PlaceResult[]> {
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  }

  const results: PlaceResult[] = [];

  // Build the request body for the new Places API
  const requestBody: Record<string, unknown> = {
    textQuery: params.query,
    maxResultCount: 20,
  };

  // Add location bias if provided
  if (params.location) {
    const [lat, lng] = params.location.split(',').map(Number);
    requestBody.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: params.radius || 50000,
      },
    };
  }

  // Add included type if provided
  if (params.type) {
    requestBody.includedType = params.type;
  }

  try {
    const response = await axios.post(
      `${PLACES_API_BASE}/places:searchText`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.types,places.location,places.businessStatus,places.regularOpeningHours,places.googleMapsUri,places.paymentOptions,places.priceRange,places.pureServiceAreaBusiness,places.evChargeOptions,places.parkingOptions,places.accessibilityOptions,places.reviews,places.photos,places.editorialSummary,places.generativeSummary',
        },
      }
    );

    const places = response.data.places || [];

    for (const place of places) {
      if (params.minRating && place.rating < params.minRating) continue;

      results.push({
        placeId: place.id,
        name: place.displayName?.text || place.displayName,
        address: place.formattedAddress,
        phone: place.nationalPhoneNumber || place.internationalPhoneNumber,
        website: place.websiteUri,
        rating: place.rating,
        reviewCount: place.userRatingCount,
        types: place.types,
        location: {
          lat: place.location?.latitude,
          lng: place.location?.longitude,
        },
        businessStatus: place.businessStatus,
        openNow: place.regularOpeningHours?.openNow,
        // Phase 1 Enrichment Fields
        paymentOptions: place.paymentOptions,
        priceRange: place.priceRange,
        pureServiceAreaBusiness: place.pureServiceAreaBusiness,
        evChargeOptions: place.evChargeOptions,
        parkingOptions: place.parkingOptions,
        // Phase 2 Enrichment Fields
        accessibilityOptions: place.accessibilityOptions,
        reviews: place.reviews,
        photos: place.photos,
        editorialSummary: place.editorialSummary,
        generativeSummary: place.generativeSummary,
      } as any);
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      console.error('Google Places API error:', error.response.status, error.response.data);
      throw new Error(`Google Places API error: ${error.response.data?.error?.message || error.response.status}`);
    }
    throw error;
  }

  return results;
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  }

  try {
    const response = await axios.get(
      `${PLACES_API_BASE}/places/${placeId}`,
      {
        headers: {
          'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,rating,userRatingCount,types,regularOpeningHours,priceLevel,googleMapsUri,shortFormattedAddress,paymentOptions,priceRange,pureServiceAreaBusiness,evChargeOptions,parkingOptions,accessibilityOptions,reviews,photos,editorialSummary,generativeSummary',
        },
      }
    );

    const place = response.data;

    return {
      placeId: place.id,
      name: place.displayName?.text || place.displayName,
      formattedAddress: place.formattedAddress,
      formattedPhone: place.nationalPhoneNumber,
      internationalPhone: place.internationalPhoneNumber,
      website: place.websiteUri,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      types: place.types,
      openingHours: place.regularOpeningHours?.weekdayDescriptions,
      priceLevel: place.priceLevel ? ['FREE', 'INEXPENSIVE', 'MODERATE', 'EXPENSIVE', 'VERY_EXPENSIVE'].indexOf(place.priceLevel) : undefined,
      url: place.googleMapsUri,
      vicinity: place.shortFormattedAddress,
    };
  } catch (error) {
    console.error('Error fetching place details:', error);
    return null;
  }
}

export async function scrapeLocalBusinesses(
  params: PlaceSearchParams,
  fetchDetails: boolean = false // New API returns details in search, so default to false
): Promise<Lead[]> {
  console.log(`[GooglePlaces] Searching for: "${params.query}" in ${params.location || 'any location'}`);

  const places = await textSearch(params);
  console.log(`[GooglePlaces] Found ${places.length} places`);

  const leads: Lead[] = [];

  for (const place of places) {
    let details: PlaceDetails | null = null;

    // New API already returns phone/website in search, only fetch details if explicitly requested
    if (fetchDetails && !place.phone && !place.website) {
      details = await getPlaceDetails(place.placeId);
      // Rate limiting - Google has strict limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const lead: Lead = {
      company: place.name,
      phone: place.phone || details?.formattedPhone || details?.internationalPhone,
      website: place.website || details?.website,
      location: place.address || details?.formattedAddress,
      industry: categorizeBusinessType(place.types || []),
      source: 'google_places',
      status: 'new',
      metadata: {
        placeId: place.placeId,
        rating: place.rating,
        reviewCount: place.reviewCount,
        types: place.types,
        googleMapsUrl: details?.url,
        openingHours: details?.openingHours,
        priceLevel: details?.priceLevel,
        businessStatus: place.businessStatus,
        scrapedAt: new Date().toISOString(),
        // Phase 1 Enrichment Fields
        paymentOptions: (place as any).paymentOptions,
        priceRange: (place as any).priceRange,
        pureServiceAreaBusiness: (place as any).pureServiceAreaBusiness,
        evChargeOptions: (place as any).evChargeOptions,
        parkingOptions: (place as any).parkingOptions,
        // Phase 2 Enrichment Fields
        accessibilityOptions: (place as any).accessibilityOptions,
        reviews: (place as any).reviews,
        photos: (place as any).photos,
        editorialSummary: (place as any).editorialSummary,
        generativeSummary: (place as any).generativeSummary,
      },
    };

    leads.push(lead);
  }

  console.log(`[GooglePlaces] Converted ${leads.length} places to leads`);
  return leads;
}

export async function searchNearby(
  lat: number,
  lng: number,
  businessType: string,
  radiusMeters: number = 10000
): Promise<Lead[]> {
  return scrapeLocalBusinesses({
    query: businessType,
    location: `${lat},${lng}`,
    radius: radiusMeters,
  });
}

function categorizeBusinessType(types: string[]): string {
  const categoryMap: Record<string, string> = {
    restaurant: 'Food & Dining',
    cafe: 'Food & Dining',
    bar: 'Food & Dining',
    bakery: 'Food & Dining',
    dentist: 'Healthcare',
    doctor: 'Healthcare',
    hospital: 'Healthcare',
    pharmacy: 'Healthcare',
    health: 'Healthcare',
    lawyer: 'Legal Services',
    accounting: 'Financial Services',
    bank: 'Financial Services',
    insurance: 'Financial Services',
    real_estate_agency: 'Real Estate',
    car_dealer: 'Automotive',
    car_repair: 'Automotive',
    gym: 'Fitness & Wellness',
    spa: 'Fitness & Wellness',
    beauty_salon: 'Beauty & Personal Care',
    hair_care: 'Beauty & Personal Care',
    home_goods_store: 'Retail',
    clothing_store: 'Retail',
    electronics_store: 'Retail',
    furniture_store: 'Retail',
    plumber: 'Home Services',
    electrician: 'Home Services',
    roofing_contractor: 'Home Services',
    general_contractor: 'Construction',
    school: 'Education',
    university: 'Education',
    lodging: 'Hospitality',
    hotel: 'Hospitality',
  };

  for (const type of types) {
    if (categoryMap[type]) {
      return categoryMap[type];
    }
  }

  return 'General Business';
}

function extractDomainFromMapsUrl(placeId: string): string | undefined {
  // This is a placeholder - actual website extraction happens in getPlaceDetails
  return undefined;
}

export const googlePlaces = {
  textSearch,
  getPlaceDetails,
  scrapeLocalBusinesses,
  searchNearby,
};
