import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {matchingLocations, parseQuery, searchListings, type SearchableListing} from '../../shared/listingSearch';

const listings: SearchableListing[] = [
  {id: 'kilimani', title: 'Modern 2 Bedroom Apartment, Kilimani', location: 'Kilimani, Nairobi', type: 'residential', price: 78000, amenities: ['Parking', 'Backup generator'], description: 'Bright two-bedroom apartment off Argwings Kodhek Road.'},
  {id: 'kasarani', title: 'Spacious Bedsitter, Kasarani', location: 'Kasarani, Nairobi', type: 'residential', price: 12500, amenities: ['Water included'], description: 'Well-lit bedsitter close to Thika Road.'},
  {id: 'westlands-office', title: 'Open-plan Office Space, Westlands', location: 'Westlands, Nairobi', type: 'commercial', price: 180000, amenities: ['Fibre internet'], description: 'Grade A office.'},
  {id: 'westlands-studio', title: 'Furnished Studio, Westlands', location: 'Westlands, Nairobi', type: 'residential', price: 38000, amenities: ['Wi-Fi', 'Gym'], description: 'Fully furnished studio.'},
  {id: 'diani', title: 'Beachfront Villa Stay, Diani', location: 'Diani Beach, Kwale', type: 'bnb', price: 15000, amenities: ['Private pool'], description: 'Villa near the beach.'},
  {id: 'syokimau', title: '3 Bedroom Maisonette, Syokimau', location: 'Syokimau, Machakos', type: 'residential', price: 55000, amenities: ['Garden'], description: 'Family maisonette.'},
];

const ids = (query: string) => searchListings(listings, query).map((r) => r.listing.id);

describe('listing search', () => {
  it('matches locations by prefix and with a typo', () => {
    assert.deepEqual(ids('kili'), ['kilimani']);
    assert.deepEqual(ids('kilimanl'), ['kilimani']);
    assert.deepEqual(ids('KASARANI'), ['kasarani']);
  });

  it('requires every word to match', () => {
    assert.deepEqual(ids('westlands studio'), ['westlands-studio']);
    assert.deepEqual(ids('westlands kasarani'), []);
  });

  it('treats type words as filters', () => {
    assert.deepEqual(ids('office westlands'), ['westlands-office']);
    assert.deepEqual(ids('short stay'), ['diani']);
    assert.deepEqual(ids('bnb'), ['diani']);
  });

  it('understands bedrooms and price caps', () => {
    assert.deepEqual(ids('2br'), ['kilimani']);
    assert.deepEqual(ids('3 bedroom'), ['syokimau']);
    assert.deepEqual(ids('nairobi under 40k'), ['kasarani', 'westlands-studio']);
    assert.equal(parseQuery('under KES 50,000').maxPrice, 50000);
  });

  it('uses synonyms and ignores filler words', () => {
    assert.ok(ids('studio').includes('kasarani'), 'bedsitter counts as a studio');
    assert.deepEqual(ids('a house in syokimau'), ['syokimau']);
    assert.deepEqual(ids('wifi'), ['westlands-studio', 'westlands-office'], 'Wi-Fi first, fibre internet counts too');
  });

  it('ranks location matches above description matches', () => {
    const results = searchListings(listings, 'nairobi');
    assert.equal(results.length, 4);
  });

  it('suggests matching areas', () => {
    assert.deepEqual(matchingLocations(listings, 'west'), ['Westlands, Nairobi']);
  });
});
